import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema(
  {
    // Exactly two participants: the patient and the donor.
    participants: [
      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    ],
    request: { type: mongoose.Schema.Types.ObjectId, ref: 'BloodRequest', default: null },
    lastMessage: {
      body: { type: String, trim: true },
      sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      sentAt: { type: Date },
    },
    // Map of userId -> count of messages they have not read yet.
    unread: { type: Map, of: Number, default: {} },
  },
  { timestamps: true }
);

conversationSchema.index({ participants: 1, updatedAt: -1 });

/** Finds the 1:1 conversation between two users, creating it on first contact. */
conversationSchema.statics.findOrCreate = async function findOrCreate(userA, userB, requestId = null) {
  const participants = [userA, userB].map(String).sort();
  const existing = await this.findOne({ participants: { $all: participants, $size: 2 } });
  if (existing) return existing;
  return this.create({ participants, request: requestId, unread: {} });
};

export const Conversation = mongoose.model('Conversation', conversationSchema);
