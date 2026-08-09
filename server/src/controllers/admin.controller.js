import { User } from '../models/User.js';
import { BloodRequest } from '../models/BloodRequest.js';
import { Donation } from '../models/Donation.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import { ROLES } from '../utils/constants.js';
import {
  generateReport,
  getBloodGroupBreakdown,
  getCityBreakdown,
  getOverview,
  getTopDonors,
  getTrend,
  reportToCSVRows,
  toCSV,
} from '../services/report.service.js';

/** GET /api/admin/stats — cards + charts for the dashboard landing. */
export const stats = asyncHandler(async (_req, res) => {
  const [overview, bloodGroups, trend, cities, topDonors] = await Promise.all([
    getOverview(),
    getBloodGroupBreakdown(),
    getTrend({ days: 30 }),
    getCityBreakdown({ limit: 8 }),
    getTopDonors({ limit: 5 }),
  ]);
  res.json({ success: true, overview, bloodGroups, trend, cities, topDonors });
});

/** GET /api/admin/users?role=&bloodGroup=&q=&page=&limit= */
export const listUsers = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Number(req.query.limit) || 20);

  const filter = {};
  if (req.query.role) filter.role = req.query.role;
  if (req.query.bloodGroup) filter.bloodGroup = req.query.bloodGroup;
  if (req.query.city) filter['address.city'] = new RegExp(req.query.city, 'i');
  if (req.query.verified === 'false') filter.isVerified = false;
  if (req.query.verified === 'true') filter.isVerified = true;
  if (req.query.q) {
    filter.$or = [
      { name: new RegExp(req.query.q, 'i') },
      { email: new RegExp(req.query.q, 'i') },
      { phone: new RegExp(req.query.q, 'i') },
    ];
  }

  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    User.countDocuments(filter),
  ]);

  res.json({
    success: true,
    users,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

/** PATCH /api/admin/users/:id — verify, deactivate, or change role. */
export const updateUser = asyncHandler(async (req, res) => {
  const { isVerified, isActive, role } = req.body;
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found');

  if (String(user._id) === String(req.user._id) && (isActive === false || role)) {
    throw ApiError.badRequest('You cannot change your own access level');
  }

  if (isVerified !== undefined) user.isVerified = Boolean(isVerified);
  if (isActive !== undefined) user.isActive = Boolean(isActive);
  if (role && Object.values(ROLES).includes(role)) user.role = role;

  await user.save({ validateBeforeSave: false });
  res.json({ success: true, user: user.toPublic() });
});

/** DELETE /api/admin/users/:id */
export const deleteUser = asyncHandler(async (req, res) => {
  if (String(req.params.id) === String(req.user._id)) {
    throw ApiError.badRequest('You cannot delete your own account');
  }
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) throw ApiError.notFound('User not found');
  res.json({ success: true, message: 'User removed' });
});

/** GET /api/admin/requests?status=&urgency=&page= */
export const listRequests = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Number(req.query.limit) || 20);

  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.urgency) filter.urgency = req.query.urgency;
  if (req.query.bloodGroup) filter.bloodGroup = req.query.bloodGroup;

  const [requests, total] = await Promise.all([
    BloodRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('patient', 'name email phone address.city')
      .lean(),
    BloodRequest.countDocuments(filter),
  ]);

  res.json({
    success: true,
    requests,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

/** POST /api/admin/donations — log a donation verified at the centre. */
export const recordDonation = asyncHandler(async (req, res) => {
  const { donorId, patientId, requestId, units, donatedAt, hospitalName, city } = req.body;

  const donor = await User.findById(donorId);
  if (!donor || donor.role !== ROLES.DONOR) throw ApiError.notFound('Donor not found');

  const donation = await Donation.create({
    donor: donor._id,
    patient: patientId,
    request: requestId,
    bloodGroup: donor.bloodGroup,
    units,
    donatedAt: donatedAt || new Date(),
    hospitalName,
    city: city || donor.address?.city,
    verifiedBy: req.user._id,
  });

  donor.donorProfile.totalDonations = (donor.donorProfile.totalDonations || 0) + 1;
  donor.donorProfile.lastDonationDate = donation.donatedAt;
  donor.donorProfile.isAvailable = false;
  await donor.save({ validateBeforeSave: false });

  res.status(201).json({ success: true, donation });
});

/**
 * GET /api/admin/reports?type=&from=&to=&format=json|csv
 * The report generator — JSON for the in-app viewer, CSV for download.
 */
export const report = asyncHandler(async (req, res) => {
  const q = req.validatedQuery || req.query;
  const data = await generateReport({
    type: q.type,
    from: q.from,
    to: q.to,
    days: q.days,
  });

  if (q.format === 'csv') {
    const csv = toCSV(reportToCSVRows(data));
    const filename = `lifelink-${data.type}-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csv);
  }

  return res.json({ success: true, report: data });
});
