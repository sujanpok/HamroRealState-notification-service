import { Router } from 'express';
const router = Router();

// Add .js extension or the server will not find the file
import { send } from '../controllers/notificationController.js';

router.post('/send', send);

export default router;
