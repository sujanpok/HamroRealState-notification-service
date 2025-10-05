import 'dotenv/config';

import express, { json } from 'express';
import authMiddleware from './middleware/auth.js';
import emailRoutes from './routes/email.js';
import notificationRoutes from './routes/notification.js';

const app = express();
app.use(json());

app.get('/', (req, res) => {
  res.send('Notification microservice is running!');
});

app.use(authMiddleware);

app.use('/email', emailRoutes);
app.use('/notification', notificationRoutes);

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`✅ Notification microservice running at http://localhost:${port}`);
});


// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

