import { BloodRequest } from '../models/BloodRequest.js';
import { Donation } from '../models/Donation.js';
import { User } from '../models/User.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import { COMPATIBLE_RECIPIENTS, REQUEST_STATUS, ROLES } from '../utils/constants.js';
import { emitToUsers } from '../sockets/index.js';

/** POST /api/requests — a patient raises a new blood request. */
export const createRequest = asyncHandler(async (req, res) => {
  const patient = req.user;
  const { bloodGroup, unitsNeeded, urgency, neededBy, hospitalName, note, address, coordinates } =
    req.body;

  const request = await BloodRequest.create({
    patient: patient._id,
    bloodGroup: bloodGroup || patient.bloodGroup,
    unitsNeeded,
    urgency,
    neededBy,
    hospitalName: hospitalName || patient.patientProfile?.hospitalName,
    note,
    address: address || patient.address,
    ...(coordinates
      ? { location: { type: 'Point', coordinates } }
      : patient.location?.coordinates
        ? { location: { type: 'Point', coordinates: patient.location.coordinates } }
        : {}),
  });

  res.status(201).json({ success: true, request });
});

/** GET /api/requests/mine — the logged-in patient's own requests. */
export const myRequests = asyncHandler(async (req, res) => {
  const requests = await BloodRequest.find({ patient: req.user._id })
    .sort({ createdAt: -1 })
    .populate('matches.donor', 'name bloodGroup address.city avatarUrl')
    .lean();
  res.json({ success: true, count: requests.length, requests });
});

/**
 * GET /api/requests/feed — open requests a donor is eligible to answer,
 * nearest first when the donor has coordinates on file.
 */
export const donorFeed = asyncHandler(async (req, res) => {
  const donor = req.user;
  const recipients = COMPATIBLE_RECIPIENTS[donor.bloodGroup] || [];
  const radiusKm = donor.donorProfile?.preferredRadiusKm || 25;

  const filter = {
    status: REQUEST_STATUS.OPEN,
    bloodGroup: { $in: recipients },
    patient: { $ne: donor._id },
  };

  if (donor.location?.coordinates?.length === 2) {
    const requests = await BloodRequest.aggregate([
      {
        $geoNear: {
          near: { type: 'Point', coordinates: donor.location.coordinates },
          distanceField: 'distanceMeters',
          maxDistance: radiusKm * 1000,
          spherical: true,
          query: filter,
        },
      },
      { $limit: 50 },
      { $lookup: { from: 'users', localField: 'patient', foreignField: '_id', as: 'patient' } },
      { $unwind: '$patient' },
      // Surface only *this* donor's own entry — the full match list is other
      // donors' business, not theirs.
      {
        $addFields: {
          myResponse: {
            $first: {
              $filter: {
                input: '$matches',
                as: 'm',
                cond: { $eq: ['$$m.donor', donor._id] },
              },
            },
          },
        },
      },
      {
        $project: {
          'patient.password': 0,
          'patient.donorProfile': 0,
          matches: 0,
        },
      },
    ]);
    return res.json({
      success: true,
      count: requests.length,
      radiusKm,
      requests: requests.map((r) => ({
        ...r,
        distanceKm: Math.round((r.distanceMeters / 1000) * 10) / 10,
      })),
    });
  }

  const requests = await BloodRequest.find(filter)
    .sort({ urgency: -1, createdAt: -1 })
    .limit(50)
    .populate('patient', 'name address avatarUrl')
    .lean();

  return res.json({
    success: true,
    count: requests.length,
    radiusKm,
    requests: requests.map(({ matches, ...r }) => ({
      ...r,
      myResponse: (matches || []).find((m) => String(m.donor) === String(donor._id)) || null,
    })),
  });
});

/** GET /api/requests/:id */
export const getRequest = asyncHandler(async (req, res) => {
  const request = await BloodRequest.findById(req.params.id)
    .populate('patient', 'name bloodGroup address avatarUrl phone')
    .populate('matches.donor', 'name bloodGroup address.city avatarUrl');
  if (!request) throw ApiError.notFound('Blood request not found');
  res.json({ success: true, request });
});

/**
 * PATCH /api/requests/:id/respond — a donor accepts or declines.
 * Feeds the reliability + responsiveness features of the recommender.
 */
export const respondToRequest = asyncHandler(async (req, res) => {
  const { action } = req.body; // 'accepted' | 'declined'
  if (!['accepted', 'declined'].includes(action)) {
    throw ApiError.badRequest("action must be 'accepted' or 'declined'");
  }

  const request = await BloodRequest.findById(req.params.id);
  if (!request) throw ApiError.notFound('Blood request not found');
  if (request.status === REQUEST_STATUS.CANCELLED) {
    throw ApiError.badRequest('This request was cancelled');
  }

  const donor = req.user;
  const existing = request.matches.find((m) => String(m.donor) === String(donor._id));
  const now = new Date();

  if (existing) {
    existing.status = action;
    existing.respondedAt = now;
  } else {
    request.matches.push({ donor: donor._id, status: action, respondedAt: now, matchScore: null });
  }

  if (action === 'accepted' && request.status === REQUEST_STATUS.OPEN) {
    request.status = REQUEST_STATUS.MATCHED;
  }
  await request.save();

  // Update the donor's rolling behavioural signals — these feed the
  // `reliability` and `responsiveness` features of the recommender.
  const profile = donor.donorProfile?.toObject?.() || donor.donorProfile || {};
  const received = (profile.requestsReceived || 0) + 1;
  const accepted = (profile.requestsAccepted || 0) + (action === 'accepted' ? 1 : 0);
  const minutesTaken = Math.max(1, (now - new Date(request.createdAt)) / 60000);
  const prevAvg = profile.avgResponseMinutes;

  donor.donorProfile = {
    ...profile,
    requestsReceived: received,
    requestsAccepted: accepted,
    avgResponseMinutes:
      prevAvg == null ? minutesTaken : (prevAvg * (received - 1) + minutesTaken) / received,
  };
  await donor.save({ validateBeforeSave: false });

  emitToUsers([request.patient], 'request:response', {
    requestId: String(request._id),
    donor: { _id: donor._id, name: donor.name, bloodGroup: donor.bloodGroup },
    action,
  });

  res.json({ success: true, request });
});

/** PATCH /api/requests/:id/cancel — patient (or admin) closes a request. */
export const cancelRequest = asyncHandler(async (req, res) => {
  const request = await BloodRequest.findById(req.params.id);
  if (!request) throw ApiError.notFound('Blood request not found');
  if (String(request.patient) !== String(req.user._id) && req.user.role !== ROLES.ADMIN) {
    throw ApiError.forbidden('You can only cancel your own requests');
  }
  request.status = REQUEST_STATUS.CANCELLED;
  await request.save();
  res.json({ success: true, request });
});

/**
 * POST /api/requests/:id/fulfil — records a completed donation against the
 * request. Patients confirm their own; admins can confirm any.
 */
export const fulfilRequest = asyncHandler(async (req, res) => {
  const { donorId, units = 1 } = req.body;
  const request = await BloodRequest.findById(req.params.id);
  if (!request) throw ApiError.notFound('Blood request not found');
  if (String(request.patient) !== String(req.user._id) && req.user.role !== ROLES.ADMIN) {
    throw ApiError.forbidden('You can only confirm your own requests');
  }

  const donor = await User.findById(donorId);
  if (!donor || donor.role !== ROLES.DONOR) throw ApiError.notFound('Donor not found');

  const donation = await Donation.create({
    donor: donor._id,
    patient: request.patient,
    request: request._id,
    bloodGroup: donor.bloodGroup,
    units,
    hospitalName: request.hospitalName,
    city: request.address?.city,
    verifiedBy: req.user.role === ROLES.ADMIN ? req.user._id : undefined,
  });

  const profile = donor.ensureDonorProfile();
  profile.totalDonations = (profile.totalDonations || 0) + 1;
  profile.lastDonationDate = donation.donatedAt;
  profile.isAvailable = false; // back on the roster once the cooldown elapses
  await donor.save({ validateBeforeSave: false });

  request.unitsFulfilled += units;
  const match = request.matches.find((m) => String(m.donor) === String(donor._id));
  if (match) match.status = 'donated';
  if (request.unitsFulfilled >= request.unitsNeeded) {
    request.status = REQUEST_STATUS.FULFILLED;
    request.fulfilledAt = new Date();
  }
  await request.save();

  emitToUsers([donor._id], 'request:fulfilled', { requestId: String(request._id) });

  res.status(201).json({ success: true, request, donation });
});
