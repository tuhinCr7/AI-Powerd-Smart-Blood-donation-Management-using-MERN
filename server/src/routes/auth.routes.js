import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as auth from '../controllers/auth.controller.js';
import { protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  changePasswordSchema,
  loginSchema,
  registerSchema,
  updateProfileSchema,
} from '../validators/schemas.js';

const router = Router();

// Throttles credential stuffing without getting in a real user's way.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts — try again in 15 minutes' },
});

router.post('/register', authLimiter, validate(registerSchema), auth.register);
router.post('/login', authLimiter, validate(loginSchema), auth.login);

router.get('/me', protect, auth.me);
router.patch('/me', protect, validate(updateProfileSchema), auth.updateProfile);
router.patch('/password', protect, validate(changePasswordSchema), auth.changePassword);

export default router;
