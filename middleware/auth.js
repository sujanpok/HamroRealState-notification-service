// middleware/auth.js
export default function (req, res, next) {
  const clientKey = req.header('auth-secret-key'); // or 'x-secret-key'
  if (clientKey !== process.env.AUTH_HEADER_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}
