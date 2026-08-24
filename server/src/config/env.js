import dotenv from 'dotenv';

dotenv.config();

const origin = (value) => value.replace(/\/+$/, '');

const required = (key, fallback) => {
  const value = process.env[key] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

export const env = {
  port: Number(process.env.PORT || 5000),
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: required('MONGO_URI', 'mongodb://127.0.0.1:27017/lifelink'),
  jwtSecret: required('JWT_SECRET', 'dev-only-insecure-secret-change-me'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  // Browser Origin headers never include a trailing slash. Normalising here
  // prevents a harmless-looking CLIENT_URL=https://site.vercel.app/ from
  // breaking both Express and Socket.IO CORS in production.
  clientUrl: origin(process.env.CLIENT_URL || 'http://localhost:5173'),
  reco: {
    maxDistanceKm: Number(process.env.RECO_MAX_DISTANCE_KM || 50),
    cooldownDays: Number(process.env.RECO_DONATION_COOLDOWN_DAYS || 90),
  },
};

if (env.nodeEnv === 'production' && env.jwtSecret.startsWith('dev-only')) {
  throw new Error('JWT_SECRET must be set to a real secret in production');
}
