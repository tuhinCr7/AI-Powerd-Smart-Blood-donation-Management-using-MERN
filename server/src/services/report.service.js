import { User } from '../models/User.js';
import { BloodRequest } from '../models/BloodRequest.js';
import { Donation } from '../models/Donation.js';
import { BLOOD_GROUPS, REQUEST_STATUS, ROLES } from '../utils/constants.js';

const dayMs = 86400000;

/** Headline counters for the admin dashboard. */
export async function getOverview() {
  const since30 = new Date(Date.now() - 30 * dayMs);

  const [
    totalDonors,
    availableDonors,
    totalPatients,
    openRequests,
    criticalOpen,
    donations30,
    totalDonations,
    unverified,
  ] = await Promise.all([
    User.countDocuments({ role: ROLES.DONOR, isActive: true }),
    User.countDocuments({ role: ROLES.DONOR, isActive: true, 'donorProfile.isAvailable': true }),
    User.countDocuments({ role: ROLES.PATIENT, isActive: true }),
    BloodRequest.countDocuments({ status: REQUEST_STATUS.OPEN }),
    BloodRequest.countDocuments({ status: REQUEST_STATUS.OPEN, urgency: 'critical' }),
    Donation.countDocuments({ donatedAt: { $gte: since30 } }),
    Donation.countDocuments({}),
    User.countDocuments({ role: ROLES.DONOR, isVerified: false, isActive: true }),
  ]);

  const fulfilment = await BloodRequest.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const byStatus = Object.fromEntries(fulfilment.map((r) => [r._id, r.count]));
  const totalRequests = Object.values(byStatus).reduce((a, b) => a + b, 0);
  const fulfilled = byStatus[REQUEST_STATUS.FULFILLED] || 0;

  return {
    totalDonors,
    availableDonors,
    totalPatients,
    openRequests,
    criticalOpen,
    donationsLast30Days: donations30,
    totalDonations,
    pendingVerification: unverified,
    totalRequests,
    fulfilmentRate: totalRequests ? Math.round((fulfilled / totalRequests) * 1000) / 10 : 0,
    requestsByStatus: byStatus,
  };
}

/** Donor / request / donation counts per blood group — powers the inventory chart. */
export async function getBloodGroupBreakdown() {
  const [donors, requests, donations] = await Promise.all([
    User.aggregate([
      { $match: { role: ROLES.DONOR, isActive: true } },
      {
        $group: {
          _id: '$bloodGroup',
          donors: { $sum: 1 },
          available: {
            $sum: { $cond: [{ $eq: ['$donorProfile.isAvailable', true] }, 1, 0] },
          },
        },
      },
    ]),
    BloodRequest.aggregate([
      { $match: { status: REQUEST_STATUS.OPEN } },
      { $group: { _id: '$bloodGroup', openRequests: { $sum: 1 }, units: { $sum: '$unitsNeeded' } } },
    ]),
    Donation.aggregate([{ $group: { _id: '$bloodGroup', donations: { $sum: '$units' } } }]),
  ]);

  const index = (rows) => Object.fromEntries(rows.map((r) => [r._id, r]));
  const d = index(donors);
  const r = index(requests);
  const g = index(donations);

  return BLOOD_GROUPS.map((group) => ({
    bloodGroup: group,
    donors: d[group]?.donors || 0,
    availableDonors: d[group]?.available || 0,
    openRequests: r[group]?.openRequests || 0,
    unitsNeeded: r[group]?.units || 0,
    donations: g[group]?.donations || 0,
  }));
}

/** Daily requests vs donations over a window — powers the trend chart. */
export async function getTrend({ days = 30 } = {}) {
  const from = new Date(Date.now() - days * dayMs);
  from.setHours(0, 0, 0, 0);

  const bucket = (dateField) => [
    { $match: { [dateField]: { $gte: from } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: `$${dateField}` } },
        count: { $sum: 1 },
      },
    },
  ];

  const [requests, donations] = await Promise.all([
    BloodRequest.aggregate(bucket('createdAt')),
    Donation.aggregate(bucket('donatedAt')),
  ]);

  const reqMap = Object.fromEntries(requests.map((r) => [r._id, r.count]));
  const donMap = Object.fromEntries(donations.map((r) => [r._id, r.count]));

  const series = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(Date.now() - i * dayMs).toISOString().slice(0, 10);
    series.push({ date, requests: reqMap[date] || 0, donations: donMap[date] || 0 });
  }
  return series;
}

/** Cities ranked by demand, with local supply alongside. */
export async function getCityBreakdown({ limit = 10 } = {}) {
  const rows = await BloodRequest.aggregate([
    { $match: { 'address.city': { $nin: [null, ''] } } },
    {
      $group: {
        _id: '$address.city',
        requests: { $sum: 1 },
        unitsNeeded: { $sum: '$unitsNeeded' },
        fulfilled: { $sum: { $cond: [{ $eq: ['$status', REQUEST_STATUS.FULFILLED] }, 1, 0] } },
      },
    },
    { $sort: { requests: -1 } },
    { $limit: limit },
  ]);

  const cities = rows.map((r) => r._id);
  const donorRows = await User.aggregate([
    { $match: { role: ROLES.DONOR, isActive: true, 'address.city': { $in: cities } } },
    { $group: { _id: '$address.city', donors: { $sum: 1 } } },
  ]);
  const donorMap = Object.fromEntries(donorRows.map((r) => [r._id, r.donors]));

  return rows.map((r) => ({
    city: r._id,
    requests: r.requests,
    unitsNeeded: r.unitsNeeded,
    fulfilled: r.fulfilled,
    donors: donorMap[r._id] || 0,
    supplyRatio: r.requests ? Math.round(((donorMap[r._id] || 0) / r.requests) * 100) / 100 : 0,
  }));
}

/** Most active donors in the period. */
export async function getTopDonors({ limit = 10, days = 365 } = {}) {
  const from = new Date(Date.now() - days * dayMs);
  return Donation.aggregate([
    { $match: { donatedAt: { $gte: from } } },
    { $group: { _id: '$donor', donations: { $sum: 1 }, units: { $sum: '$units' } } },
    { $sort: { units: -1, donations: -1 } },
    { $limit: limit },
    { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'donor' } },
    { $unwind: '$donor' },
    {
      $project: {
        _id: 0,
        donorId: '$_id',
        name: '$donor.name',
        bloodGroup: '$donor.bloodGroup',
        city: '$donor.address.city',
        donations: 1,
        units: 1,
      },
    },
  ]);
}

/**
 * Assembles a full report for a date range. `type` picks which sections load.
 */
export async function generateReport({ type = 'summary', from, to, days = 30 } = {}) {
  const range = {
    from: from ? new Date(from) : new Date(Date.now() - days * dayMs),
    to: to ? new Date(to) : new Date(),
  };
  const windowDays = Math.max(
    1,
    Math.ceil((range.to.getTime() - range.from.getTime()) / dayMs)
  );

  const sections = {};
  if (type === 'summary' || type === 'full') sections.overview = await getOverview();
  if (type === 'inventory' || type === 'full' || type === 'summary') {
    sections.bloodGroups = await getBloodGroupBreakdown();
  }
  if (type === 'activity' || type === 'full' || type === 'summary') {
    sections.trend = await getTrend({ days: windowDays });
  }
  if (type === 'geography' || type === 'full') sections.cities = await getCityBreakdown();
  if (type === 'donors' || type === 'full') {
    sections.topDonors = await getTopDonors({ days: windowDays });
  }
  if (type === 'donations' || type === 'full') {
    sections.donations = await Donation.find({
      donatedAt: { $gte: range.from, $lte: range.to },
    })
      .populate('donor', 'name bloodGroup address.city')
      .populate('patient', 'name')
      .sort({ donatedAt: -1 })
      .limit(500)
      .lean();
  }

  return {
    type,
    range: { from: range.from.toISOString(), to: range.to.toISOString(), days: windowDays },
    generatedAt: new Date().toISOString(),
    ...sections,
  };
}

/** Minimal RFC-4180 CSV writer — no dependency needed for a flat table. */
export function toCSV(rows) {
  if (!rows?.length) return '';
  const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const escape = (v) => {
    if (v == null) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))].join(
    '\n'
  );
}

/** Flattens whichever section of a report makes sense as a spreadsheet. */
export function reportToCSVRows(report) {
  if (report.donations?.length) {
    return report.donations.map((d) => ({
      donatedAt: d.donatedAt,
      donor: d.donor?.name,
      bloodGroup: d.bloodGroup,
      units: d.units,
      patient: d.patient?.name || '',
      hospital: d.hospitalName || '',
      city: d.city || d.donor?.address?.city || '',
    }));
  }
  if (report.cities?.length) return report.cities;
  if (report.topDonors?.length) return report.topDonors;
  if (report.trend?.length) return report.trend;
  if (report.bloodGroups?.length) return report.bloodGroups;
  return [report.overview || {}];
}
