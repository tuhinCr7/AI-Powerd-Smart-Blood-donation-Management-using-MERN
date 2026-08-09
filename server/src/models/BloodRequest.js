import mongoose from 'mongoose';
import { BLOOD_GROUPS, REQUEST_STATUS, URGENCY } from '../utils/constants.js';

/** A donor the recommender surfaced for this request, plus how they responded. */
const matchSchema = new mongoose.Schema(
  {
    donor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    matchScore: { type: Number, min: 0, max: 100 },
    status: {
      type: String,
      enum: ['suggested', 'contacted', 'accepted', 'declined', 'donated'],
      default: 'suggested',
    },
    respondedAt: { type: Date },
  },
  { _id: false, timestamps: true }
);

const bloodRequestSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    bloodGroup: { type: String, enum: BLOOD_GROUPS, required: true, index: true },
    unitsNeeded: { type: Number, required: true, min: 1, max: 20, default: 1 },
    unitsFulfilled: { type: Number, default: 0, min: 0 },
    urgency: {
      type: String,
      enum: Object.values(URGENCY),
      default: URGENCY.NORMAL,
      index: true,
    },
    neededBy: { type: Date },
    hospitalName: { type: String, trim: true },
    note: { type: String, trim: true, maxlength: 500 },

    address: {
      line: { type: String, trim: true },
      city: { type: String, trim: true, index: true },
      district: { type: String, trim: true },
    },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: undefined },
    },

    status: {
      type: String,
      enum: Object.values(REQUEST_STATUS),
      default: REQUEST_STATUS.OPEN,
      index: true,
    },
    matches: { type: [matchSchema], default: [] },
    fulfilledAt: { type: Date },
  },
  { timestamps: true }
);

bloodRequestSchema.index({ location: '2dsphere' });
bloodRequestSchema.index({ status: 1, createdAt: -1 });

bloodRequestSchema.virtual('isFulfilled').get(function isFulfilled() {
  return this.unitsFulfilled >= this.unitsNeeded;
});

export const BloodRequest = mongoose.model('BloodRequest', bloodRequestSchema);
