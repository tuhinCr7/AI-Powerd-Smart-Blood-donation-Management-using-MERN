import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { BLOOD_GROUPS, ROLES } from '../utils/constants.js';

const pointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point' },
    // GeoJSON order is [longitude, latitude]
    coordinates: { type: [Number], default: undefined },
  },
  { _id: false }
);

/** Donor-only fields. Present on donor documents, ignored elsewhere. */
const donorProfileSchema = new mongoose.Schema(
  {
    isAvailable: { type: Boolean, default: true },
    lastDonationDate: { type: Date, default: null },
    totalDonations: { type: Number, default: 0, min: 0 },
    weightKg: { type: Number, min: 0 },
    dateOfBirth: { type: Date },
    hasChronicIllness: { type: Boolean, default: false },
    // Rolling behavioural signals the recommender learns from.
    requestsReceived: { type: Number, default: 0, min: 0 },
    requestsAccepted: { type: Number, default: 0, min: 0 },
    avgResponseMinutes: { type: Number, default: null },
    preferredRadiusKm: { type: Number, default: 25, min: 1, max: 500 },
  },
  { _id: false }
);

/** Patient-only fields. */
const patientProfileSchema = new mongoose.Schema(
  {
    hospitalName: { type: String, trim: true },
    condition: { type: String, trim: true },
    attendingDoctor: { type: String, trim: true },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email address'],
    },
    password: { type: String, required: true, minlength: 8, select: false },
    phone: { type: String, trim: true, maxlength: 24 },
    role: { type: String, enum: Object.values(ROLES), required: true, index: true },
    bloodGroup: { type: String, enum: BLOOD_GROUPS, required: true, index: true },

    address: {
      line: { type: String, trim: true },
      city: { type: String, trim: true, index: true },
      district: { type: String, trim: true },
    },
    location: { type: pointSchema, default: undefined },

    donorProfile: { type: donorProfileSchema, default: undefined },
    patientProfile: { type: patientProfileSchema, default: undefined },

    isVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    avatarUrl: { type: String, trim: true },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

userSchema.index({ location: '2dsphere' });
userSchema.index({ role: 1, bloodGroup: 1, 'donorProfile.isAvailable': 1 });

/** Days since the donor last gave blood — null when they never have. */
userSchema.virtual('daysSinceLastDonation').get(function daysSince() {
  const last = this.donorProfile?.lastDonationDate;
  if (!last) return null;
  return Math.floor((Date.now() - new Date(last).getTime()) / 86400000);
});

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  return next();
});

userSchema.methods.comparePassword = function comparePassword(plain) {
  return bcrypt.compare(plain, this.password);
};

/** Strips sensitive fields before a document leaves the API. */
userSchema.methods.toPublic = function toPublic() {
  const obj = this.toObject({ virtuals: true });
  delete obj.password;
  delete obj.__v;
  return obj;
};

export const User = mongoose.model('User', userSchema);
