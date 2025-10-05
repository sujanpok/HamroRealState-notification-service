// middleware/auth.js
export default function authMiddleware(req, res, next) {
  // Skip auth for root path
  if (req.path === '/') {
    return next();
  }
  
  const authKey = req.headers['auth-secret-key'];
  
  if (!authKey || authKey !== process.env.AUTH_HEADER_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  next();
}
