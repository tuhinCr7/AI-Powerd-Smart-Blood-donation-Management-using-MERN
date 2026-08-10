import { BloodRequest } from '../models/BloodRequest.js';
import { recommendDonors } from '../services/recommendation.service.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import { env } from '../config/env.js';

/**
 * GET /api/recommendations
 * Ranks donors for the logged-in patient. Location and blood group default to
 * the patient's profile, or to the linked request when `requestId` is given.
 */
export const getRecommendations = asyncHandler(async (req, res) => {
  const q = req.validatedQuery || req.query;
  const patient = req.user;

  let bloodGroup = q.bloodGroup || patient.bloodGroup;
  let coordinates = q.lng != null && q.lat != null ? [q.lng, q.lat] : patient.location?.coordinates;
  let city = q.city || patient.address?.city;
  let request = null;

  if (q.requestId) {
    request = await BloodRequest.findById(q.requestId);
    if (!request) throw ApiError.notFound('Blood request not found');
    if (String(request.patient) !== String(patient._id) && patient.role !== 'admin') {
      throw ApiError.forbidden('This request belongs to another patient');
    }
    bloodGroup = q.bloodGroup || request.bloodGroup;
    coordinates = q.lng != null ? coordinates : request.location?.coordinates || coordinates;
    city = q.city || request.address?.city || city;
  }

  const { results, meta } = await recommendDonors({
    recipientGroup: bloodGroup,
    coordinates,
    city,
    maxDistanceKm: q.radiusKm || env.reco.maxDistanceKm,
    limit: q.limit || 12,
    excludeIds: [patient._id],
  });

  // Remember who we surfaced, so the admin funnel and donor stats stay honest.
  if (request) {
    request.matches = results.map((r) => ({
      donor: r.donor._id,
      matchScore: r.matchScore,
      status: 'suggested',
    }));
    await request.save();
  }

  res.json({ success: true, count: results.length, meta, results });
});

/** GET /api/recommendations/explain — surfaces the model card for the UI. */
export const explainModel = asyncHandler(async (_req, res) => {
  res.json({
    success: true,
    model: {
      name: 'LifeLink Donor Match',
      version: '2.0',
      approach:
        'Three factors, and nothing else: blood group, availability and location. The blood group match picks a non-overlapping score band, and distance only orders donors inside that band — so an exact match always outranks a merely compatible donor, however close by. Donors in your city are always shown, even when they fall outside the search radius.',
      bands: [
        { label: 'Exact match', band: '85–100', detail: 'Type-specific — same ABO and Rh, e.g. A+ to A+.' },
        { label: 'Same ABO group', band: '70–85', detail: 'Right ABO, opposite Rh, e.g. A− to A+.' },
        { label: 'Compatible group', band: '55–70', detail: 'Different ABO but transfusable, e.g. O+ to A+.' },
        { label: 'Universal donor', band: '40–55', detail: 'O− to a non-O− recipient — ranked last so the scarcest stock is conserved for recipients who have no alternative.' },
      ],
      features: [
        { key: 'compatibility', label: 'Blood group fit', detail: 'Not a competing feature — it selects the score band outright.' },
        { key: 'proximity', label: 'Location', detail: 'Exponential decay with a 12 km half-life, computed on a 2dsphere geo index. A donor in your city who saved no coordinates scores 0.6. Orders donors within a band, never across bands.' },
      ],
      hardFilters: [
        'Donor role and an active account',
        'Marked available to donate',
        'ABO/Rh compatible with the recipient',
        'In your city, or within the search radius',
      ],
      notScored: [
        'Donation cooldown, age, weight and declared illness are no longer filters here — they are verified at the collection centre, where the answers can be checked.',
      ],
    },
  });
});
