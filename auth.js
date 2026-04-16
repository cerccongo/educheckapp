// backend/middleware/auth.js
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

/**
 * Attach `req.user` if a valid Bearer token is present.
 * Does NOT block unauthenticated requests — use requireRole() for that.
 */
function attachUser(req, _res, next) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    const token = header.slice(7);
    try {
      req.user = jwt.verify(token, JWT_SECRET);
    } catch {
      req.user = null;
    }
  }
  next();
}

/**
 * Block unauthenticated requests.
 */
function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  next();
}

/**
 * Block requests whose role is not in the allowed list.
 * Usage:  router.get('/route', requireRole('cerc_analyst', 'school_admin'), handler)
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Access restricted to: ${roles.join(', ')}` });
    }
    next();
  };
}

/**
 * Sign a JWT for a user object.
 */
function signToken(user) {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role, schoolId: user.school_id || null },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

module.exports = { attachUser, requireAuth, requireRole, signToken };
