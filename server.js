import 'dotenv/config';
import express, { json } from 'express';
import authMiddleware from './middleware/auth.js';
import emailRoutes from './routes/email.js';
//import notificationRoutes from './routes/notification.js';

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
//app.use('/notification', notificationRoutes);

// Listen port
const port = process.env.PORT || 3004;
app.listen(port, () => {
  console.log(`✅ Notification microservice running at http://localhost:${port}`);
});
