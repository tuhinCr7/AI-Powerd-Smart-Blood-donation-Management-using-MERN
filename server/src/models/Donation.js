import mongoose from 'mongoose';
import { BLOOD_GROUPS } from '../utils/constants.js';

/** A completed donation — the source of truth for reports and donor history. */
const donationSchema = new mongoose.Schema(
  {
    donor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    request: { type: mongoose.Schema.Types.ObjectId, ref: 'BloodRequest', index: true },
    bloodGroup: { type: String, enum: BLOOD_GROUPS, required: true },
    units: { type: Number, default: 1, min: 1, max: 5 },
    donatedAt: { type: Date, default: Date.now, index: true },
    hospitalName: { type: String, trim: true },
    city: { type: String, trim: true, index: true },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

donationSchema.index({ donatedAt: -1, bloodGroup: 1 });

export const Donation = mongoose.model('Donation', donationSchema);
