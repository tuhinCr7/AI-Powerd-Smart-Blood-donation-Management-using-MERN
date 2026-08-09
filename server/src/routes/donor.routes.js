import { Router } from 'express';
import * as donors from '../controllers/donor.controller.js';
import { protect, restrictTo } from '../middleware/auth.js';
import { ROLES } from '../utils/constants.js';

const router = Router();

router.get('/stats/public', donors.publicStats);

router.get('/me/dashboard', protect, restrictTo(ROLES.DONOR), donors.donorDashboard);
router.patch('/me/availability', protect, restrictTo(ROLES.DONOR), donors.setAvailability);

router.get('/', protect, donors.searchDonors);
router.get('/:id', protect, donors.getDonor);

export default router;
