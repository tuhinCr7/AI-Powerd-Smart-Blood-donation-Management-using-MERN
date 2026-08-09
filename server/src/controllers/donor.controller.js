import { User } from '../models/User.js';
import { Donation } from '../models/Donation.js';
import { BloodRequest } from '../models/BloodRequest.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import { COMPATIBLE_DONORS, ROLES } from '../utils/constants.js';
import { isOnline } from '../sockets/index.js';

/**
 * GET /api/donors — plain directory search (no ranking).
 * The AI-ranked view lives at /api/recommendations.
 */
export const searchDonors = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Number(req.query.limit) || 12);

  const filter = { role: ROLES.DONOR, isActive: true };
  if (req.query.bloodGroup) filter.bloodGroup = req.query.bloodGroup;
  if (req.query.compatibleWith) {
    filter.bloodGroup = { $in: COMPATIBLE_DONORS[req.query.compatibleWith] || [] };
  }
  if (req.query.city) filter['address.city'] = new RegExp(req.query.city, 'i');
  if (req.query.available !== 'false') filter['donorProfile.isAvailable'] = true;

  const [donors, total] = await Promise.all([
    User.find(filter)
      .select('name bloodGroup address avatarUrl isVerified lastSeenAt donorProfile.totalDonations donorProfile.isAvailable donorProfile.lastDonationDate')
      .sort({ 'donorProfile.totalDonations': -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);

  res.json({
    success: true,
    donors: donors.map((d) => ({ ...d, isOnline: isOnline(d._id) })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

/** GET /api/donors/:id — public donor card. */
export const getDonor = asyncHandler(async (req, res) => {
  const donor = await User.findOne({ _id: req.params.id, role: ROLES.DONOR, isActive: true })
    .select('name bloodGroup address avatarUrl isVerified lastSeenAt donorProfile createdAt')
    .lean();
  if (!donor) throw ApiError.notFound('Donor not found');

  const donations = await Donation.countDocuments({ donor: donor._id });
  res.json({ success: true, donor: { ...donor, isOnline: isOnline(donor._id), donations } });
});

/** GET /api/donors/me/dashboard — the donor's own home screen payload. */
export const donorDashboard = asyncHandler(async (req, res) => {
  const donor = req.user;

  const [donations, pendingMatches, lastDonation] = await Promise.all([
    Donation.find({ donor: donor._id }).sort({ donatedAt: -1 }).limit(10).populate('patient', 'name').lean(),
    BloodRequest.countDocuments({ 'matches.donor': donor._id, status: { $in: ['open', 'matched'] } }),
    Donation.findOne({ donor: donor._id }).sort({ donatedAt: -1 }).lean(),
  ]);

  const cooldownDays = 90;
  const profile = donor.donorProfile || {};
  const daysSince = profile.lastDonationDate
    ? Math.floor((Date.now() - new Date(profile.lastDonationDate)) / 86400000)
    : null;
  const nextEligibleInDays = daysSince == null ? 0 : Math.max(0, cooldownDays - daysSince);

  /**
   * Every hard filter the recommender applies, mirrored back at the donor.
   * A donor who is invisible to patients must be able to see why, and what to
   * do about it — otherwise they sit on the register believing they are
   * findable when they are not.
   */
  const age = profile.dateOfBirth
    ? Math.floor((Date.now() - new Date(profile.dateOfBirth)) / 31557600000)
    : null;

  const blockers = [
    {
      key: 'unavailable',
      blocked: profile.isAvailable !== true,
      title: 'You are marked unavailable',
      fix: 'Use the toggle above to make yourself visible again.',
      selfFixable: true,
    },
    {
      key: 'chronicIllness',
      blocked: profile.hasChronicIllness === true,
      title: 'You declared a chronic illness',
      fix: 'If that was ticked by mistake, untick it on your profile — it hides you from all match results.',
      selfFixable: true,
    },
    {
      key: 'cooldown',
      blocked: nextEligibleInDays > 0,
      title: `You are inside the ${cooldownDays}-day donation cooldown`,
      fix: `You will reappear in match results in ${nextEligibleInDays} days.`,
      selfFixable: false,
    },
    {
      key: 'age',
      blocked: age != null && (age < 18 || age > 65),
      title: `Recorded age (${age}) is outside the 18–65 range`,
      fix: 'Check your date of birth on your profile.',
      selfFixable: true,
    },
    {
      key: 'weight',
      blocked: profile.weightKg != null && profile.weightKg < 45,
      title: `Recorded weight (${profile.weightKg} kg) is below the 45 kg minimum`,
      fix: 'Check your weight on your profile.',
      selfFixable: true,
    },
    {
      key: 'inactive',
      blocked: donor.isActive === false,
      title: 'Your account has been deactivated',
      fix: 'Contact an administrator.',
      selfFixable: false,
    },
  ].filter((b) => b.blocked);

  const noLocation = !donor.location?.coordinates?.length;

  res.json({
    success: true,
    dashboard: {
      totalDonations: donor.donorProfile?.totalDonations || 0,
      livesImpacted: (donor.donorProfile?.totalDonations || 0) * 3,
      isAvailable: donor.donorProfile?.isAvailable !== false,
      lastDonationDate: donor.donorProfile?.lastDonationDate || null,
      daysSinceLastDonation: daysSince,
      nextEligibleInDays,
      isEligibleNow: nextEligibleInDays === 0,
      // Visibility in patients' match results — the single most important
      // thing a donor needs to know about their own account.
      isVisibleToPatients: blockers.length === 0,
      blockers,
      noLocation,
      acceptanceRate:
        donor.donorProfile?.requestsReceived
          ? Math.round(
              ((donor.donorProfile.requestsAccepted || 0) / donor.donorProfile.requestsReceived) * 100
            )
          : null,
      avgResponseMinutes: donor.donorProfile?.avgResponseMinutes ?? null,
      pendingMatches,
      recentDonations: donations,
      lastDonation,
    },
  });
});

/** PATCH /api/donors/me/availability — the big toggle on the donor dashboard. */
export const setAvailability = asyncHandler(async (req, res) => {
  const donor = req.user;
  if (donor.role !== ROLES.DONOR) throw ApiError.forbidden('Only donors have an availability flag');

  donor.donorProfile = donor.donorProfile || {};
  donor.donorProfile.isAvailable = Boolean(req.body.isAvailable);
  await donor.save({ validateBeforeSave: false });

  res.json({ success: true, isAvailable: donor.donorProfile.isAvailable });
});

/** GET /api/donors/stats/public — counters for the marketing homepage. */
export const publicStats = asyncHandler(async (_req, res) => {
  const [donors, availableNow, donations, openRequests] = await Promise.all([
    User.countDocuments({ role: ROLES.DONOR, isActive: true }),
    User.countDocuments({ role: ROLES.DONOR, isActive: true, 'donorProfile.isAvailable': true }),
    Donation.countDocuments({}),
    BloodRequest.countDocuments({ status: 'open' }),
  ]);
  res.json({
    success: true,
    stats: { donors, availableNow, donations, livesImpacted: donations * 3, openRequests },
  });
});
