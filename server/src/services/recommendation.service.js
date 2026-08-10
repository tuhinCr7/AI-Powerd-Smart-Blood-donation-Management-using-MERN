import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { env } from '../config/env.js';
import { COMPATIBLE_DONORS, ROLES } from '../utils/constants.js';
import { haversineKm, isValidCoords } from '../utils/geo.js';
import { exactInsensitive } from '../utils/text.js';

/**
 * ---------------------------------------------------------------------------
 * Donor recommendation engine
 * ---------------------------------------------------------------------------
 * Three factors decide everything, and nothing else is consulted:
 *
 *   1. **Blood group**  — must be transfusable, and picks the score band.
 *   2. **Availability** — the donor must be active and marked available.
 *   3. **Location**     — same city, or inside the search radius; distance then
 *                         orders donors *within* their band.
 *
 * Blood group is the primary key, not a feature competing with distance. Each
 * donor lands in a band determined purely by how well their group matches the
 * recipient's, and distance only moves them up or down inside that band. An
 * exact match therefore always outranks a merely compatible one, however close
 * by the latter happens to be — mirroring transfusion practice: give
 * type-specific blood first, and conserve the versatile groups.
 *
 * Because the bands do not overlap, the number on a card can never contradict
 * the order the cards are listed in.
 *
 * Medical screening (cooldown, age, weight, chronic illness) is deliberately
 * *not* applied here — that happens at the collection centre, where it can be
 * verified. Filtering on self-reported values only hid willing donors.
 */

/**
 * Compatibility bands, best first. `tier` is the primary sort key; `band` is
 * the score range a donor in that tier can occupy.
 */
const COMPATIBILITY_TIERS = [
  { tier: 0, key: 'exact',      label: 'Exact match',      band: [85, 100], score: 1.0 },
  { tier: 1, key: 'sameAbo',    label: 'Same ABO group',   band: [70, 85],  score: 0.8 },
  { tier: 2, key: 'compatible', label: 'Compatible group', band: [55, 70],  score: 0.62 },
  { tier: 3, key: 'universal',  label: 'Universal donor',  band: [40, 55],  score: 0.45 },
];

/** Distance at which the proximity score decays to ~37%. */
const PROXIMITY_TAU_KM = 12;

/**
 * Position inside the band for a same-city donor who never saved coordinates.
 * Deliberately generous: "in your city" is a strong signal, and punishing a
 * donor for skipping the geolocation prompt is exactly how they go unseen.
 */
const SAME_CITY_NO_COORDS_SCORE = 0.6;
/** Neither coordinates nor a city match — findable, but ranked last. */
const UNKNOWN_LOCATION_SCORE = 0.25;

const clamp01 = (n) => Math.min(1, Math.max(0, n));

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

/** The one within-band factor: how close the donor is. */
function proximityScore(distanceKm, sameCity) {
  if (distanceKm == null) {
    return sameCity ? SAME_CITY_NO_COORDS_SCORE : UNKNOWN_LOCATION_SCORE;
  }
  return clamp01(Math.exp(-distanceKm / PROXIMITY_TAU_KM));
}

// --- explanation -------------------------------------------------------------

function buildReasons({ donor, distanceKm, sameCity, recipientGroup, compatibility }) {
  const reasons = [];

  reasons.push({
    icon: 'drop',
    text: {
      exact: `Exact ${donor.bloodGroup} match — type-specific`,
      sameAbo: `${donor.bloodGroup} — same ABO group as ${recipientGroup}`,
      compatible: `${donor.bloodGroup} is compatible with ${recipientGroup}`,
      universal: `${donor.bloodGroup} universal donor — compatible with ${recipientGroup}`,
    }[compatibility.key],
  });

  if (distanceKm != null) {
    const pretty = distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1)} km`;
    reasons.push({
      icon: 'pin',
      text: `${pretty} away${distanceKm <= 5 ? ' — same neighbourhood' : ''}`,
    });
  } else if (donor.address?.city) {
    reasons.push({
      icon: 'pin',
      text: sameCity ? `In your city — ${donor.address.city}` : `Based in ${donor.address.city}`,
    });
  } else {
    reasons.push({ icon: 'pin', text: 'No location saved' });
  }

  reasons.push({ icon: 'check', text: 'Available to donate now' });

  return reasons;
}

// --- candidate retrieval -----------------------------------------------------

/**
 * The hard filters — blood group and availability. Location is applied
 * separately, because it needs both a geospatial and a city path.
 */
function buildBaseMatch({ recipientGroup, excludeIds = [] }) {
  return {
    role: ROLES.DONOR,
    isActive: true,
    bloodGroup: { $in: COMPATIBLE_DONORS[recipientGroup] || [] },
    'donorProfile.isAvailable': true,
    _id: { $nin: excludeIds.map((id) => new mongoose.Types.ObjectId(String(id))) },
  };
}

const PUBLIC_FIELDS = '-password -__v';

/**
 * Pulls the eligible donor pool along two paths that are then merged:
 *
 *   a) **radius** — a $geoNear stage when we know where the patient is, so
 *      Mongo does the distance work on the 2dsphere index.
 *   b) **city**   — an exact (case-insensitive) match on `address.city`.
 *
 * Both are needed. $geoNear silently drops every document without a location,
 * so a donor who skipped the "use my location" step would be invisible to any
 * patient who did set one. And a donor who *has* coordinates but sits just
 * beyond the radius would be dropped too, even while living in the same city.
 *
 * Running the city pass unconditionally — not just as a no-coordinates
 * fallback — is what guarantees the rule the product promises: **a donor in
 * your city with a compatible group is always visible to you**, whatever the
 * radius says and whichever of you saved coordinates.
 */
async function fetchCandidates({ recipientGroup, coordinates, city, maxDistanceKm, excludeIds, limit }) {
  const baseMatch = buildBaseMatch({ recipientGroup, excludeIds });
  const cityRegex = city?.trim() ? exactInsensitive(city) : null;

  const cityPass = cityRegex
    ? User.find({ ...baseMatch, 'address.city': cityRegex })
        .limit(limit * 5)
        .select(PUBLIC_FIELDS)
        .lean()
    : Promise.resolve([]);

  if (!isValidCoords(coordinates)) {
    // No patient location at all. City if we have one, otherwise every
    // compatible available donor — better a long list than an empty one.
    const sameCity = await cityPass;
    if (sameCity.length > 0 || cityRegex) {
      return sameCity.map((d) => ({ ...d, sameCity: true }));
    }
    return (await User.find(baseMatch).limit(limit * 5).select(PUBLIC_FIELDS).lean())
      .map((d) => ({ ...d, sameCity: false }));
  }

  const [inRadius, sameCity] = await Promise.all([
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
    cityPass,
  ]);

  const byId = new Map();
  inRadius.forEach((d) => byId.set(String(d._id), { ...d, sameCity: false }));

  // City hits either annotate a donor we already have, or join the pool
  // outright — the latter is the case that used to go missing.
  sameCity.forEach((d) => {
    const key = String(d._id);
    const existing = byId.get(key);
    if (existing) existing.sameCity = true;
    else byId.set(key, { ...d, sameCity: true });
  });

  return [...byId.values()];
}

/**
 * Counts how many otherwise-compatible donors each hard filter removed.
 *
 * Without this, "no donors found" is a dead end — a patient cannot tell an
 * empty register from a register full of people who have paused. Counts
 * overlap (one donor can fail two checks), so this is a list of reasons,
 * not a partition.
 */
async function diagnoseExclusions({ recipientGroup, city }) {
  const compatibleGroups = COMPATIBLE_DONORS[recipientGroup] || [];

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
        noLocationSaved: {
          $sum: { $cond: [{ $eq: [{ $ifNull: ['$location.coordinates', null] }, null] }, 1, 0] },
        },
        inYourCity: {
          $sum: {
            $cond: [
              { $eq: [{ $toLower: { $ifNull: ['$address.city', ''] } }, (city || '').trim().toLowerCase()] },
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
 * Ranks donors for a recipient on blood group, availability and location.
 *
 * @param {object} params
 * @param {string} params.recipientGroup  Patient blood group, e.g. 'A+'
 * @param {number[]} [params.coordinates] [lng, lat] of the patient/hospital
 * @param {string}  [params.city]         Locality — always consulted, not just
 *                                        as a fallback when coords are absent
 * @param {number}  [params.maxDistanceKm]
 * @param {number}  [params.limit]
 * @param {string[]}[params.excludeIds]   Donors to omit (e.g. the patient themself)
 * @returns {Promise<{results: object[], meta: object}>}
 */
export async function recommendDonors({
  recipientGroup,
  coordinates,
  city,
  maxDistanceKm = env.reco.maxDistanceKm,
  limit = 12,
  excludeIds = [],
}) {
  if (!COMPATIBLE_DONORS[recipientGroup]) {
    throw new Error(`Unknown blood group: ${recipientGroup}`);
  }

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

    // Step 2 — location decides the position inside that band.
    const features = {
      compatibility: compatibility.score,
      proximity: proximityScore(distanceKm, donor.sameCity),
    };

    const [floor, ceiling] = compatibility.band;
    const matchScore = floor + features.proximity * (ceiling - floor);

    return {
      compatibility: {
        tier: compatibility.tier,
        key: compatibility.key,
        label: compatibility.label,
        band: compatibility.band,
      },
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
          isAvailable: donor.donorProfile?.isAvailable !== false,
        },
      },
      matchScore: Math.round(matchScore * 10) / 10, // 0–100, one decimal
      distanceKm: distanceKm == null ? null : Math.round(distanceKm * 10) / 10,
      sameCity: Boolean(donor.sameCity),
      features: Object.fromEntries(
        Object.entries(features).map(([k, v]) => [k, Math.round(v * 100) / 100])
      ),
      reasons: buildReasons({
        donor,
        distanceKm,
        sameCity: donor.sameCity,
        recipientGroup,
        compatibility,
      }),
    };
  });

  // Tier first, then distance. The bands already guarantee this ordering, so
  // the explicit tier key is belt-and-braces against a future band change.
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
      ranking: 'blood-group-first',
      factors: ['bloodGroup', 'availability', 'location'],
      tiers: COMPATIBILITY_TIERS.map(({ tier, key, label, band }) => ({ tier, key, label, band })),
      // How many of the returned donors sit in each band — lets the UI say
      // "6 exact matches" without recounting.
      tierCounts: results.reduce((acc, r) => {
        acc[r.compatibility.key] = (acc[r.compatibility.key] || 0) + 1;
        return acc;
      }, {}),
      sameCityCount: results.filter((r) => r.sameCity).length,
      searchRadiusKm: maxDistanceKm,
      searchCity: city || null,
      candidatesEvaluated: candidates.length,
      usedGeoIndex: isValidCoords(coordinates),
      generatedAt: new Date().toISOString(),
    },
  };
}

export const __testing = {
  compatibilityTier,
  proximityScore,
  COMPATIBILITY_TIERS,
};
