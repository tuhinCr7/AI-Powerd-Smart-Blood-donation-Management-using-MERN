import { User } from '../models/User.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import { ROLES } from '../utils/constants.js';
import { signToken } from '../utils/token.js';

const sendAuth = (res, user, statusCode = 200) =>
  res.status(statusCode).json({
    success: true,
    token: signToken(user),
    user: user.toPublic(),
  });

export const register = asyncHandler(async (req, res) => {
  const {
    name, email, password, phone, role, bloodGroup, address, coordinates,
    dateOfBirth, weightKg, lastDonationDate, hasChronicIllness,
    hospitalName, condition,
  } = req.body;

  if (await User.exists({ email: email.toLowerCase() })) {
    throw ApiError.conflict('An account with that email already exists');
  }

  const doc = {
    name, email, password, phone, role, bloodGroup, address,
    ...(coordinates ? { location: { type: 'Point', coordinates } } : {}),
  };

  if (role === ROLES.DONOR) {
    doc.donorProfile = {
      isAvailable: true,
      dateOfBirth,
      weightKg,
      lastDonationDate: lastDonationDate || null,
      hasChronicIllness: Boolean(hasChronicIllness),
      totalDonations: 0,
    };
  } else {
    doc.patientProfile = { hospitalName, condition };
  }

  const user = await User.create(doc);
  return sendAuth(res, user, 201);
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

  if (!user || !(await user.comparePassword(password))) {
    throw ApiError.unauthorized('Incorrect email or password');
  }
  if (!user.isActive) throw ApiError.forbidden('This account has been deactivated');

  user.lastSeenAt = new Date();
  await user.save({ validateBeforeSave: false });
  user.password = undefined;

  return sendAuth(res, user);
});

export const me = asyncHandler(async (req, res) => {
  res.json({ success: true, user: req.user.toPublic() });
});

export const updateProfile = asyncHandler(async (req, res) => {
  const user = req.user;
  const {
    name, phone, avatarUrl, address, coordinates,
    isAvailable, weightKg, dateOfBirth, hasChronicIllness, preferredRadiusKm, lastDonationDate,
    hospitalName, condition,
  } = req.body;

  if (name !== undefined) user.name = name;
  if (phone !== undefined) user.phone = phone;
  if (avatarUrl !== undefined) user.avatarUrl = avatarUrl;
  if (address !== undefined) user.address = { ...user.address?.toObject?.(), ...address };
  if (coordinates !== undefined) user.location = { type: 'Point', coordinates };

  if (user.role === ROLES.DONOR) {
    user.donorProfile = user.donorProfile || {};
    if (isAvailable !== undefined) user.donorProfile.isAvailable = isAvailable;
    if (weightKg !== undefined) user.donorProfile.weightKg = weightKg;
    if (dateOfBirth !== undefined) user.donorProfile.dateOfBirth = dateOfBirth;
    if (hasChronicIllness !== undefined) user.donorProfile.hasChronicIllness = hasChronicIllness;
    if (preferredRadiusKm !== undefined) user.donorProfile.preferredRadiusKm = preferredRadiusKm;
    if (lastDonationDate !== undefined) user.donorProfile.lastDonationDate = lastDonationDate;
  } else if (user.role === ROLES.PATIENT) {
    user.patientProfile = user.patientProfile || {};
    if (hospitalName !== undefined) user.patientProfile.hospitalName = hospitalName;
    if (condition !== undefined) user.patientProfile.condition = condition;
  }

  await user.save();
  res.json({ success: true, user: user.toPublic() });
});

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id).select('+password');

  if (!(await user.comparePassword(currentPassword))) {
    throw ApiError.unauthorized('Current password is incorrect');
  }
  user.password = newPassword;
  await user.save();

  res.json({ success: true, message: 'Password updated', token: signToken(user) });
});
