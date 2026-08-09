import { Router } from 'express';
import * as chat from '../controllers/chat.controller.js';
import { protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { sendMessageSchema, startConversationSchema } from '../validators/schemas.js';

const router = Router();
router.use(protect);

router.get('/conversations', chat.listConversations);
router.post('/conversations', validate(startConversationSchema), chat.startConversation);
router.get('/conversations/:id/messages', chat.getMessages);
router.post('/conversations/:id/messages', validate(sendMessageSchema), chat.sendMessage);

export default router;
