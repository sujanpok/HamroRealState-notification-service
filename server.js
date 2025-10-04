import 'dotenv/config'; // loads env vars from .env
import express, { json } from 'express';
import authMiddleware from './middleware/auth.js';
import emailRoutes from './routes/email.js';
import notificationRoutes from './routes/notification.js';

const app = express();
app.use(json());

// Basic route
app.get('/', (req, res) => {
  res.send('Notification microservice is running!');
});

// Authentication middleware
app.use(authMiddleware);

// Routes
app.use('/email', emailRoutes);
app.use('/notification', notificationRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Listen port
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`✅ Notification microservice running at http://localhost:${port}`);
});
