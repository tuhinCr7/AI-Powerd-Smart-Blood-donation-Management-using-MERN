import { Router } from 'express';
import * as admin from '../controllers/admin.controller.js';
import { protect, restrictTo } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { recordDonationSchema, reportQuerySchema } from '../validators/schemas.js';
import { ROLES } from '../utils/constants.js';

const router = Router();
router.use(protect, restrictTo(ROLES.ADMIN));

router.get('/stats', admin.stats);
router.get('/reports', validate(reportQuerySchema, 'query'), admin.report);

router.get('/users', admin.listUsers);
router.patch('/users/:id', admin.updateUser);
router.delete('/users/:id', admin.deleteUser);

router.get('/requests', admin.listRequests);
router.post('/donations', validate(recordDonationSchema), admin.recordDonation);

export default router;
