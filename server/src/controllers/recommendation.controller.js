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
  let urgency = q.urgency || 'normal';
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
    urgency = q.urgency || request.urgency;
  }

  const { results, meta } = await recommendDonors({
    recipientGroup: bloodGroup,
    coordinates,
    city,
    urgency,
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
      version: '1.0',
      approach:
        'Feature-based scoring with urgency-conditional weights and a logistic link for response probability.',
      features: [
        { key: 'compatibility', label: 'Blood group fit', detail: 'Exact match preferred; universal donors are conserved for recipients with no alternative.' },
        { key: 'proximity', label: 'Distance', detail: 'Exponential decay with a 12 km half-life, computed on a 2dsphere geo index.' },
        { key: 'readiness', label: 'Medical readiness', detail: `Time since last donation against a ${env.reco.cooldownDays}-day cooldown.` },
        { key: 'reliability', label: 'Acceptance history', detail: 'Beta-smoothed acceptance rate so small samples do not dominate.' },
        { key: 'responsiveness', label: 'Reply speed', detail: 'Exponential decay on average reply time (45 min half-life).' },
        { key: 'experience', label: 'Donation history', detail: 'Log-scaled lifetime donations.' },
        { key: 'activity', label: 'Recent activity', detail: 'Recency of last app activity, 14-day decay.' },
      ],
      hardFilters: [
        'Donor role, active account, marked available',
        'ABO/Rh compatible with the recipient',
        `At least ${env.reco.cooldownDays} days since the last donation`,
        'Age 18–65 and weight ≥ 45 kg where recorded',
        'No declared chronic illness',
        'Within the search radius',
      ],
    },
  });
});
