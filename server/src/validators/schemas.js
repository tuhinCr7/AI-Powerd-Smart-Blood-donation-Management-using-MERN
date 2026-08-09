import { z } from 'zod';
import { BLOOD_GROUPS, ROLES, URGENCY } from '../utils/constants.js';

const coordinates = z
  .array(z.number())
  .length(2)
  .refine(([lng, lat]) => Math.abs(lng) <= 180 && Math.abs(lat) <= 90, {
    message: 'Coordinates must be [longitude, latitude]',
  });

const addressSchema = z
  .object({
    line: z.string().max(160).optional(),
    city: z.string().max(80).optional(),
    district: z.string().max(80).optional(),
  })
  .optional();

export const registerSchema = z
  .object({
    name: z.string().min(2).max(80),
    email: z.string().email(),
    password: z.string().min(8, 'Password must be at least 8 characters').max(128),
    phone: z.string().min(6).max(24).optional(),
    role: z.enum([ROLES.DONOR, ROLES.PATIENT]),
    bloodGroup: z.enum(BLOOD_GROUPS),
    address: addressSchema,
    coordinates: coordinates.optional(),
    // donor extras
    dateOfBirth: z.coerce.date().optional(),
    weightKg: z.number().min(30).max(250).optional(),
    lastDonationDate: z.coerce.date().optional().nullable(),
    hasChronicIllness: z.boolean().optional(),
    // patient extras
    hospitalName: z.string().max(120).optional(),
    condition: z.string().max(160).optional(),
  })
  .strict();

export const loginSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(1, 'Password is required'),
  })
  .strict();

export const updateProfileSchema = z
  .object({
    name: z.string().min(2).max(80).optional(),
    phone: z.string().min(6).max(24).optional(),
    avatarUrl: z.string().url().optional(),
    address: addressSchema,
    coordinates: coordinates.optional(),
    isAvailable: z.boolean().optional(),
    weightKg: z.number().min(30).max(250).optional(),
    dateOfBirth: z.coerce.date().optional(),
    hasChronicIllness: z.boolean().optional(),
    preferredRadiusKm: z.number().min(1).max(500).optional(),
    lastDonationDate: z.coerce.date().nullable().optional(),
    hospitalName: z.string().max(120).optional(),
    condition: z.string().max(160).optional(),
  })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8).max(128),
  })
  .strict();

export const createRequestSchema = z
  .object({
    bloodGroup: z.enum(BLOOD_GROUPS).optional(),
    unitsNeeded: z.number().int().min(1).max(20).default(1),
    urgency: z.enum(Object.values(URGENCY)).default(URGENCY.NORMAL),
    neededBy: z.coerce.date().optional(),
    hospitalName: z.string().max(120).optional(),
    note: z.string().max(500).optional(),
    address: addressSchema,
    coordinates: coordinates.optional(),
  })
  .strict();

export const recommendQuerySchema = z
  .object({
    bloodGroup: z.enum(BLOOD_GROUPS).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    lat: z.coerce.number().min(-90).max(90).optional(),
    city: z.string().max(80).optional(),
    urgency: z.enum(Object.values(URGENCY)).optional(),
    radiusKm: z.coerce.number().min(1).max(500).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
    requestId: z.string().length(24).optional(),
  })
  .strict();

export const sendMessageSchema = z
  .object({
    body: z.string().min(1).max(2000),
  })
  .strict();

export const startConversationSchema = z
  .object({
    donorId: z.string().length(24).optional(),
    userId: z.string().length(24).optional(),
    requestId: z.string().length(24).optional(),
  })
  .strict()
  .refine((v) => v.donorId || v.userId, { message: 'donorId or userId is required' });

export const recordDonationSchema = z
  .object({
    donorId: z.string().length(24),
    patientId: z.string().length(24).optional(),
    requestId: z.string().length(24).optional(),
    units: z.number().int().min(1).max(5).default(1),
    donatedAt: z.coerce.date().optional(),
    hospitalName: z.string().max(120).optional(),
    city: z.string().max(80).optional(),
  })
  .strict();

export const reportQuerySchema = z
  .object({
    type: z.enum(['summary', 'inventory', 'activity', 'geography', 'donors', 'donations', 'full']).default('summary'),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    days: z.coerce.number().int().min(1).max(730).optional(),
    format: z.enum(['json', 'csv']).default('json'),
  })
  .strict();
