import { Router } from 'express';
import * as requests from '../controllers/request.controller.js';
import { protect, restrictTo } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createRequestSchema } from '../validators/schemas.js';
import { ROLES } from '../utils/constants.js';

const router = Router();
router.use(protect);

router.post('/', restrictTo(ROLES.PATIENT), validate(createRequestSchema), requests.createRequest);
router.get('/mine', restrictTo(ROLES.PATIENT), requests.myRequests);
router.get('/feed', restrictTo(ROLES.DONOR), requests.donorFeed);

router.get('/:id', requests.getRequest);
router.patch('/:id/respond', restrictTo(ROLES.DONOR), requests.respondToRequest);
router.patch('/:id/cancel', restrictTo(ROLES.PATIENT, ROLES.ADMIN), requests.cancelRequest);
router.post('/:id/fulfil', restrictTo(ROLES.PATIENT, ROLES.ADMIN), requests.fulfilRequest);

export default router;
