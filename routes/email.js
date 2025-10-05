// routes/email.js
import express from 'express';
import { send } from '../controllers/emailController.js';

const router = express.Router();

router.post('/send', send);

export default router;
