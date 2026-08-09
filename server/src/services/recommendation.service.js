import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { env } from '../config/env.js';
import { COMPATIBLE_DONORS, ROLES, URGENCY } from '../utils/constants.js';
import { haversineKm, isValidCoords } from '../utils/geo.js';

/**
 * ---------------------------------------------------------------------------
 * Donor recommendation engine
 * ---------------------------------------------------------------------------
 * A transparent, explainable ranking model built on a simple principle:
 *
 *   **blood group decides the band, everything else decides the position
 *   inside that band.**
 *
 * Blood-group fit is not one feature competing with distance — it is the
 * primary key. Each donor lands in a score band determined purely by how well
 * their group matches the recipient's, and the remaining features (distance,
 * readiness, reliability, reply speed, history, activity) only move them up or
 * down *within* that band. An exact match therefore always outranks a merely
 * compatible one, however close by the latter happens to be. This mirrors
 * transfusion practice: give type-specific blood first, and conserve the
 * versatile groups for the recipients who have no alternative.
 *
 * Because the bands do not overlap, the number shown on a card can never
 * contradict the order the cards are listed in.
 *
 * Nothing here is a black box: `reasons`, `features` and `compatibility` travel
 * with each result so the UI can tell a patient *why* a donor was suggested.
 */

/**
 * Compatibility bands, best first. `tier` is the primary sort key; `band` is
 * the score range a donor in that tier can occupy.
 */
const COMPATIBILITY_TIERS = [
  { tier: 0, key: 'exact',     label: 'Exact match',      band: [85, 100], score: 1.0 },
  { tier: 1, key: 'sameAbo',   label: 'Same ABO group',   band: [70, 85],  score: 0.8 },
  { tier: 2, key: 'compatible',label: 'Compatible group', band: [55, 70],  score: 0.62 },
  { tier: 3, key: 'universal', label: 'Universal donor',  band: [40, 55],  score: 0.45 },
];

/**
 * Weights for the *within-band* quality score. Each column sums to 1.
 * Blood group is deliberately absent — it already picked the band.
 */
const QUALITY_WEIGHTS = {
  [URGENCY.LOW]:      { proximity: 0.22, readiness: 0.26, reliability: 0.24, responsiveness: 0.13, experience: 0.09, activity: 0.06 },
  [URGENCY.NORMAL]:   { proximity: 0.30, readiness: 0.24, reliability: 0.21, responsiveness: 0.13, experience: 0.08, activity: 0.04 },
  [URGENCY.HIGH]:     { proximity: 0.38, readiness: 0.18, reliability: 0.18, responsiveness: 0.17, experience: 0.05, activity: 0.04 },
  [URGENCY.CRITICAL]: { proximity: 0.46, readiness: 0.13, reliability: 0.15, responsiveness: 0.21, experience: 0.03, activity: 0.02 },
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

/** 'A+' -> 'A'. Strips the Rh sign to compare ABO groups alone. */
const aboOf = (group) => group.replace(/[+-]$/, '');

/**
 * Places a compatible donor into a band, most specific match first:
 *
 *   0  exact      A+ → A+   type-specific, always preferred
 *   1  same ABO   A- → A+   right ABO, opposite Rh
 *   2  compatible O+ → A+   different ABO but transfusable
 *   3  universal  O- → A+   the scarcest stock, conserved for those with no
 *                           alternative (O- recipients, who see it as tier 0)
 *
 * Callers must have already established that the pair is transfusable.
 */
function compatibilityTier(donorGroup, recipientGroup) {
  if (donorGroup === recipientGroup) return COMPATIBILITY_TIERS[0];
  if (donorGroup === 'O-') return COMPATIBILITY_TIERS[3];
  if (aboOf(donorGroup) === aboOf(recipientGroup)) return COMPATIBILITY_TIERS[1];
  return COMPATIBILITY_TIERS[2];
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

function buildReasons({ donor, distanceKm, features, recipientGroup, compatibility }) {
  const reasons = [];

  const groupText = {
    exact: `Exact ${donor.bloodGroup} match — type-specific`,
    sameAbo: `${donor.bloodGroup} — same ABO group as ${recipientGroup}`,
    compatible: `${donor.bloodGroup} is compatible with ${recipientGroup}`,
    universal: `${donor.bloodGroup} universal donor — compatible with ${recipientGroup}`,
  }[compatibility.key];
  reasons.push({ icon: 'drop', text: groupText });

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
function buildBaseMatch({ recipientGroup, excludeIds = [] }) {
  const compatibleGroups = COMPATIBLE_DONORS[recipientGroup] || [];
  const cooldownCutoff = new Date(Date.now() - env.reco.cooldownDays * 86400000);
  const minBirth = new Date(Date.now() - 65 * 365.25 * 86400000); // max age 65
  const maxBirth = new Date(Date.now() - 18 * 365.25 * 86400000); // min age 18

  return {
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
}

/** Matches donor records that have no usable GeoJSON point on file. */
const NO_COORDINATES = {
  $or: [
    { location: { $exists: false } },
    { 'location.coordinates': { $exists: false } },
    { 'location.coordinates': null },
    { 'location.coordinates': { $size: 0 } },
  ],
};

/**
 * Pulls the eligible donor pool. Uses a $geoNear stage when we know where the
 * patient is (so Mongo does the distance work on the 2dsphere index).
 *
 * $geoNear silently drops any document without a location, so a donor who
 * skipped the "use my location" step would be invisible to every patient who
 * did set one — however close they actually are. We therefore run a second
 * pass for city-matched donors with no coordinates and merge the two.
 */
async function fetchCandidates({ recipientGroup, coordinates, city, maxDistanceKm, excludeIds, limit }) {
  const baseMatch = buildBaseMatch({ recipientGroup, excludeIds });
  const cityRegex = city ? new RegExp(`^${city.trim()}$`, 'i') : null;

  if (isValidCoords(coordinates)) {
    const [located, unlocated] = await Promise.all([
      User.aggregate([
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
      ]),
      cityRegex
        ? User.find({ ...baseMatch, ...NO_COORDINATES, 'address.city': cityRegex })
            .limit(limit * 2)
            .select('-password -__v')
            .lean()
        : [],
    ]);

    const seen = new Set(located.map((d) => String(d._id)));
    return [...located, ...unlocated.filter((d) => !seen.has(String(d._id)))];
  }

  const geoFreeMatch = { ...baseMatch };
  if (cityRegex) geoFreeMatch['address.city'] = cityRegex;
  return User.find(geoFreeMatch).limit(limit * 5).select('-password -__v').lean();
}

/**
 * Counts how many otherwise-compatible donors each hard filter removed.
 *
 * Without this, "no donors found" is a dead end — a patient cannot tell an
 * empty register from a register full of people who all happen to be inside
 * their donation cooldown. Counts overlap (one donor can fail two filters), so
 * this is a list of reasons, not a partition.
 */
async function diagnoseExclusions({ recipientGroup, city }) {
  const compatibleGroups = COMPATIBLE_DONORS[recipientGroup] || [];
  const cooldownCutoff = new Date(Date.now() - env.reco.cooldownDays * 86400000);
  const minBirth = new Date(Date.now() - 65 * 365.25 * 86400000);
  const maxBirth = new Date(Date.now() - 18 * 365.25 * 86400000);

  const [row] = await User.aggregate([
    { $match: { role: ROLES.DONOR, bloodGroup: { $in: compatibleGroups } } },
    {
      $group: {
        _id: null,
        compatibleDonors: { $sum: 1 },
        deactivated: { $sum: { $cond: [{ $eq: ['$isActive', false] }, 1, 0] } },
        markedUnavailable: {
          $sum: { $cond: [{ $ne: ['$donorProfile.isAvailable', true] }, 1, 0] },
        },
        declaredChronicIllness: {
          $sum: { $cond: [{ $eq: ['$donorProfile.hasChronicIllness', true] }, 1, 0] },
        },
        withinCooldown: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $ne: [{ $ifNull: ['$donorProfile.lastDonationDate', null] }, null] },
                  { $gt: ['$donorProfile.lastDonationDate', cooldownCutoff] },
                ],
              },
              1,
              0,
            ],
          },
        },
        outsideAgeRange: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $ne: [{ $ifNull: ['$donorProfile.dateOfBirth', null] }, null] },
                  {
                    $or: [
                      { $lt: ['$donorProfile.dateOfBirth', minBirth] },
                      { $gt: ['$donorProfile.dateOfBirth', maxBirth] },
                    ],
                  },
                ],
              },
              1,
              0,
            ],
          },
        },
        underWeight: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $ne: [{ $ifNull: ['$donorProfile.weightKg', null] }, null] },
                  { $lt: ['$donorProfile.weightKg', 45] },
                ],
              },
              1,
              0,
            ],
          },
        },
        noLocationSaved: {
          $sum: { $cond: [{ $eq: [{ $ifNull: ['$location.coordinates', null] }, null] }, 1, 0] },
        },
        inYourCity: {
          $sum: {
            $cond: [
              { $eq: [{ $toLower: { $ifNull: ['$address.city', ''] } }, (city || '').toLowerCase()] },
              1,
              0,
            ],
          },
        },
      },
    },
    { $project: { _id: 0 } },
  ]);

  return row || { compatibleDonors: 0 };
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

  const weights = QUALITY_WEIGHTS[urgency] || QUALITY_WEIGHTS[URGENCY.NORMAL];
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

    // Step 1 — blood group picks the band. This is the primary key.
    const compatibility = compatibilityTier(donor.bloodGroup, recipientGroup);

    // Step 2 — everything else decides the position inside that band.
    const features = {
      compatibility: compatibility.score,
      proximity: proximityScore(distanceKm),
      readiness: readinessScore(donor.donorProfile?.lastDonationDate, env.reco.cooldownDays),
      reliability: reliabilityScore(donor.donorProfile),
      responsiveness: responsivenessScore(donor.donorProfile?.avgResponseMinutes),
      experience: experienceScore(donor.donorProfile?.totalDonations),
      activity: activityScore(donor.lastSeenAt),
    };

    const quality = Object.entries(weights).reduce(
      (sum, [key, w]) => sum + w * features[key],
      0
    );

    const [floor, ceiling] = compatibility.band;
    const matchScore = floor + quality * (ceiling - floor);

    // Response probability is about the *donor*, not their blood type, so it
    // reads off the quality score alone. Logistic link centred at 0.55.
    const responseProbability = sigmoid((quality - 0.55) * 7);

    return {
      compatibility: {
        tier: compatibility.tier,
        key: compatibility.key,
        label: compatibility.label,
        band: compatibility.band,
      },
      qualityScore: Math.round(quality * 100) / 100,
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
      matchScore: Math.round(matchScore * 10) / 10, // 0–100, one decimal
      responseProbability: Math.round(responseProbability * 100),
      distanceKm: distanceKm == null ? null : Math.round(distanceKm * 10) / 10,
      features: Object.fromEntries(
        Object.entries(features).map(([k, v]) => [k, Math.round(v * 100) / 100])
      ),
      reasons: buildReasons({ donor, distanceKm, features, recipientGroup, compatibility }),
    };
  });

  // Tier first, then quality. The bands already guarantee this ordering, so the
  // explicit tier key is belt-and-braces against a future band change.
  scored.sort(
    (a, b) => a.compatibility.tier - b.compatibility.tier || b.matchScore - a.matchScore
  );

  const results = scored.slice(0, limit);

  // Only worth the extra round trip when the patient is looking at a thin list
  // and deserves to know why.
  const excluded = results.length < limit
    ? await diagnoseExclusions({ recipientGroup, city })
    : null;

  return {
    results,
    meta: {
      recipientGroup,
      compatibleGroups: COMPATIBLE_DONORS[recipientGroup],
      excluded,
      urgency,
      weights,
      ranking: 'blood-group-first',
      tiers: COMPATIBILITY_TIERS.map(({ tier, key, label, band }) => ({ tier, key, label, band })),
      // How many of the returned donors sit in each band — lets the UI say
      // "6 exact matches" without recounting.
      tierCounts: results.reduce((acc, r) => {
        acc[r.compatibility.key] = (acc[r.compatibility.key] || 0) + 1;
        return acc;
      }, {}),
      searchRadiusKm: maxDistanceKm,
      candidatesEvaluated: candidates.length,
      usedGeoIndex: isValidCoords(coordinates),
      cooldownDays: env.reco.cooldownDays,
      generatedAt: new Date().toISOString(),
    },
  };
}

export const __testing = {
  compatibilityTier,
  proximityScore,
  readinessScore,
  reliabilityScore,
  responsivenessScore,
  experienceScore,
  activityScore,
  COMPATIBILITY_TIERS,
  QUALITY_WEIGHTS,
};
