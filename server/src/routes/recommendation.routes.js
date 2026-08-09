import { Router } from 'express';
import * as reco from '../controllers/recommendation.controller.js';
import { protect, restrictTo } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { recommendQuerySchema } from '../validators/schemas.js';
import { ROLES } from '../utils/constants.js';

const router = Router();
router.use(protect);

router.get('/explain', reco.explainModel);
router.get(
  '/',
  restrictTo(ROLES.PATIENT, ROLES.ADMIN),
  validate(recommendQuerySchema, 'query'),
  reco.getRecommendations
);

export default router;
