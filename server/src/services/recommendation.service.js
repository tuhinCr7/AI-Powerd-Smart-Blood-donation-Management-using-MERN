import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { env } from '../config/env.js';
import { COMPATIBLE_DONORS, ROLES, URGENCY } from '../utils/constants.js';
import { haversineKm, isValidCoords } from '../utils/geo.js';

/**
 * ---------------------------------------------------------------------------
 * Donor recommendation engine
 * ---------------------------------------------------------------------------
 * A transparent, explainable ranking model. Every candidate donor is reduced to
 * a small set of normalised features (0..1), combined with urgency-aware
 * weights into a single match score, and passed through a logistic link to get
 * a calibrated "likely to respond" probability.
 *
 * Nothing here is a black box: `reasons` and `features` travel with each result
 * so the UI can tell a patient *why* a donor was suggested.
 */

/** Feature weights per urgency level. Each column sums to 1. */
const WEIGHTS = {
  [URGENCY.LOW]:      { compatibility: 0.22, proximity: 0.18, readiness: 0.20, reliability: 0.18, responsiveness: 0.10, experience: 0.07, activity: 0.05 },
  [URGENCY.NORMAL]:   { compatibility: 0.24, proximity: 0.22, readiness: 0.18, reliability: 0.16, responsiveness: 0.10, experience: 0.06, activity: 0.04 },
  [URGENCY.HIGH]:     { compatibility: 0.24, proximity: 0.28, readiness: 0.14, reliability: 0.14, responsiveness: 0.13, experience: 0.04, activity: 0.03 },
  [URGENCY.CRITICAL]: { compatibility: 0.22, proximity: 0.34, readiness: 0.10, reliability: 0.12, responsiveness: 0.17, experience: 0.03, activity: 0.02 },
};

/** Distance at which the proximity score decays to ~37%. */
const PROXIMITY_TAU_KM = 12;
/** Response time at which responsiveness decays to ~37%. */
const RESPONSE_TAU_MIN = 45;
/** Beta prior on acceptance rate: pretend every donor already saw 5 requests. */
const RELIABILITY_PRIOR = { accepted: 2, received: 5 };

const clamp01 = (n) => Math.min(1, Math.max(0, n));
const sigmoid = (z) => 1 / (1 + Math.exp(-z));

// --- individual feature extractors ------------------------------------------

/**
 * Exact blood-group matches score highest; compatible-but-different matches are
 * discounted so that scarce universal donors (O-) are held back for the
 * recipients who have no alternative.
 */
function compatibilityScore(donorGroup, recipientGroup) {
  if (donorGroup === recipientGroup) return 1;
  if (donorGroup === 'O-' && recipientGroup !== 'O-') return 0.72;
  return 0.85;
}

function proximityScore(distanceKm) {
  if (distanceKm == null) return 0.35; // unknown location — mildly penalised
  return clamp01(Math.exp(-distanceKm / PROXIMITY_TAU_KM));
}

/**
 * How medically ready this donor is right now: time since last donation,
 * measured against the mandatory cooldown, saturating at 2x cooldown.
 */
function readinessScore(lastDonationDate, cooldownDays) {
  if (!lastDonationDate) return 0.9; // eligible but unproven
  const days = (Date.now() - new Date(lastDonationDate).getTime()) / 86400000;
  if (days < cooldownDays) return 0; // hard-filtered upstream, belt and braces
  return clamp01(0.6 + 0.4 * Math.min(1, (days - cooldownDays) / cooldownDays));
}

/** Smoothed acceptance rate so a donor with 1/1 does not outrank one with 18/20. */
function reliabilityScore(profile = {}) {
  const accepted = (profile.requestsAccepted || 0) + RELIABILITY_PRIOR.accepted;
  const received = (profile.requestsReceived || 0) + RELIABILITY_PRIOR.received;
  return clamp01(accepted / received);
}

function responsivenessScore(avgResponseMinutes) {
  if (avgResponseMinutes == null) return 0.5;
  return clamp01(Math.exp(-avgResponseMinutes / RESPONSE_TAU_MIN));
}

/** Log-scaled so the 1st donation matters far more than the 15th. */
function experienceScore(totalDonations = 0) {
  return clamp01(Math.log10(1 + totalDonations) / Math.log10(11));
}

function activityScore(lastSeenAt) {
  if (!lastSeenAt) return 0.2;
  const days = (Date.now() - new Date(lastSeenAt).getTime()) / 86400000;
  return clamp01(Math.exp(-days / 14));
}

// --- explanation -------------------------------------------------------------

function buildReasons({ donor, distanceKm, features, recipientGroup }) {
  const reasons = [];

  if (donor.bloodGroup === recipientGroup) {
    reasons.push({ icon: 'drop', text: `Exact ${donor.bloodGroup} match` });
  } else {
    reasons.push({ icon: 'drop', text: `${donor.bloodGroup} is compatible with ${recipientGroup}` });
  }

  if (distanceKm != null) {
    const pretty = distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1)} km`;
    reasons.push({ icon: 'pin', text: `${pretty} away${distanceKm <= 5 ? ' — same neighbourhood' : ''}` });
  } else if (donor.address?.city) {
    reasons.push({ icon: 'pin', text: `Based in ${donor.address.city}` });
  }

  const days = donor.donorProfile?.lastDonationDate
    ? Math.floor((Date.now() - new Date(donor.donorProfile.lastDonationDate).getTime()) / 86400000)
    : null;
  reasons.push({
    icon: 'clock',
    text: days == null ? 'Eligible — no donation on record' : `Last donated ${days} days ago`,
  });

  if (features.reliability >= 0.7) {
    reasons.push({ icon: 'check', text: `Accepts ${Math.round(features.reliability * 100)}% of requests` });
  }
  if (features.responsiveness >= 0.6 && donor.donorProfile?.avgResponseMinutes != null) {
    reasons.push({
      icon: 'bolt',
      text: `Usually replies in ~${Math.round(donor.donorProfile.avgResponseMinutes)} min`,
    });
  }
  if ((donor.donorProfile?.totalDonations || 0) >= 5) {
    reasons.push({ icon: 'star', text: `${donor.donorProfile.totalDonations} lifetime donations` });
  }

  return reasons;
}

// --- candidate retrieval -----------------------------------------------------

/**
 * Pulls the eligible donor pool. Uses a $geoNear stage when we know where the
 * patient is (so Mongo does the distance work and the 2dsphere index is used),
 * otherwise falls back to a city/district match.
 */
async function fetchCandidates({ recipientGroup, coordinates, city, maxDistanceKm, excludeIds, limit }) {
  const compatibleGroups = COMPATIBLE_DONORS[recipientGroup] || [];
  const cooldownCutoff = new Date(Date.now() - env.reco.cooldownDays * 86400000);
  const minBirth = new Date(Date.now() - 65 * 365.25 * 86400000); // max age 65
  const maxBirth = new Date(Date.now() - 18 * 365.25 * 86400000); // min age 18

  const baseMatch = {
    role: ROLES.DONOR,
    isActive: true,
    bloodGroup: { $in: compatibleGroups },
    'donorProfile.isAvailable': true,
    'donorProfile.hasChronicIllness': { $ne: true },
    $and: [
      {
        $or: [
          { 'donorProfile.lastDonationDate': null },
          { 'donorProfile.lastDonationDate': { $exists: false } },
          { 'donorProfile.lastDonationDate': { $lte: cooldownCutoff } },
        ],
      },
      {
        $or: [
          { 'donorProfile.dateOfBirth': { $exists: false } },
          { 'donorProfile.dateOfBirth': null },
          { 'donorProfile.dateOfBirth': { $gte: minBirth, $lte: maxBirth } },
        ],
      },
      {
        $or: [
          { 'donorProfile.weightKg': { $exists: false } },
          { 'donorProfile.weightKg': null },
          { 'donorProfile.weightKg': { $gte: 45 } },
        ],
      },
    ],
    _id: { $nin: excludeIds.map((id) => new mongoose.Types.ObjectId(String(id))) },
  };

  if (isValidCoords(coordinates)) {
    return User.aggregate([
      {
        $geoNear: {
          near: { type: 'Point', coordinates },
          distanceField: 'distanceMeters',
          maxDistance: maxDistanceKm * 1000,
          spherical: true,
          query: baseMatch,
        },
      },
      { $limit: limit * 5 },
      { $project: { password: 0, __v: 0 } },
    ]);
  }

  const geoFreeMatch = { ...baseMatch };
  if (city) geoFreeMatch['address.city'] = new RegExp(`^${city.trim()}$`, 'i');
  return User.find(geoFreeMatch).limit(limit * 5).select('-password -__v').lean();
}

// --- public API --------------------------------------------------------------

/**
 * Ranks donors for a recipient.
 *
 * @param {object} params
 * @param {string} params.recipientGroup  Patient blood group, e.g. 'A+'
 * @param {number[]} [params.coordinates] [lng, lat] of the patient/hospital
 * @param {string}  [params.city]         Fallback locality when coords are absent
 * @param {string}  [params.urgency]      low | normal | high | critical
 * @param {number}  [params.maxDistanceKm]
 * @param {number}  [params.limit]
 * @param {string[]}[params.excludeIds]   Donors to omit (e.g. the patient themself)
 * @returns {Promise<{results: object[], meta: object}>}
 */
export async function recommendDonors({
  recipientGroup,
  coordinates,
  city,
  urgency = URGENCY.NORMAL,
  maxDistanceKm = env.reco.maxDistanceKm,
  limit = 12,
  excludeIds = [],
}) {
  if (!COMPATIBLE_DONORS[recipientGroup]) {
    throw new Error(`Unknown blood group: ${recipientGroup}`);
  }

  const weights = WEIGHTS[urgency] || WEIGHTS[URGENCY.NORMAL];
  const candidates = await fetchCandidates({
    recipientGroup,
    coordinates,
    city,
    maxDistanceKm,
    excludeIds,
    limit,
  });

  const scored = candidates.map((donor) => {
    const distanceKm =
      donor.distanceMeters != null
        ? donor.distanceMeters / 1000
        : haversineKm(coordinates, donor.location?.coordinates);

    const features = {
      compatibility: compatibilityScore(donor.bloodGroup, recipientGroup),
      proximity: proximityScore(distanceKm),
      readiness: readinessScore(donor.donorProfile?.lastDonationDate, env.reco.cooldownDays),
      reliability: reliabilityScore(donor.donorProfile),
      responsiveness: responsivenessScore(donor.donorProfile?.avgResponseMinutes),
      experience: experienceScore(donor.donorProfile?.totalDonations),
      activity: activityScore(donor.lastSeenAt),
    };

    const weighted = Object.entries(weights).reduce(
      (sum, [key, w]) => sum + w * features[key],
      0
    );

    // Logistic link centred at 0.55 — turns the weighted sum into a probability
    // that reads like "chance this donor actually responds".
    const responseProbability = sigmoid((weighted - 0.55) * 7);

    return {
      donor: {
        _id: donor._id,
        name: donor.name,
        bloodGroup: donor.bloodGroup,
        avatarUrl: donor.avatarUrl,
        phone: donor.phone,
        address: donor.address,
        isVerified: donor.isVerified,
        lastSeenAt: donor.lastSeenAt,
        donorProfile: {
          totalDonations: donor.donorProfile?.totalDonations || 0,
          lastDonationDate: donor.donorProfile?.lastDonationDate || null,
          avgResponseMinutes: donor.donorProfile?.avgResponseMinutes ?? null,
          isAvailable: donor.donorProfile?.isAvailable !== false,
        },
      },
      matchScore: Math.round(weighted * 1000) / 10, // 0–100, one decimal
      responseProbability: Math.round(responseProbability * 100),
      distanceKm: distanceKm == null ? null : Math.round(distanceKm * 10) / 10,
      features: Object.fromEntries(
        Object.entries(features).map(([k, v]) => [k, Math.round(v * 100) / 100])
      ),
      reasons: buildReasons({ donor, distanceKm, features, recipientGroup }),
    };
  });

  scored.sort((a, b) => b.matchScore - a.matchScore);

  return {
    results: scored.slice(0, limit),
    meta: {
      recipientGroup,
      compatibleGroups: COMPATIBLE_DONORS[recipientGroup],
      urgency,
      weights,
      searchRadiusKm: maxDistanceKm,
      candidatesEvaluated: candidates.length,
      usedGeoIndex: isValidCoords(coordinates),
      cooldownDays: env.reco.cooldownDays,
      generatedAt: new Date().toISOString(),
    },
  };
}

export const __testing = {
  compatibilityScore,
  proximityScore,
  readinessScore,
  reliabilityScore,
  responsivenessScore,
  experienceScore,
  activityScore,
  WEIGHTS,
};
