import { Router } from 'express';
const router = Router();

// NOTE: .js extension is required!
import { send } from '../controllers/emailController.js';

router.post('/send', send);

export default router;
