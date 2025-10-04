import { Router } from 'express';
const router = Router();

import { send } from '../controllers/emailController.js';

router.post('/send', send);

export default router;
