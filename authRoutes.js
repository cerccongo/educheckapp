// backend/routes/authRoutes.js
const express  = require('express');
const bcrypt   = require('bcryptjs');
const { Pool } = require('pg');
const { signToken, requireAuth } = require('../middleware/auth');

const router = express.Router();
const pool   = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// ── POST /api/auth/register ────────────────────────────────────────────────
// Body: { name, email, password, role, schoolId? }
// Allowed self-registration roles: monitor | public
// school_admin and cerc_analyst must be created by an analyst (future admin panel)
router.post('/register', async (req, res) => {
  const { name, email, password, role = 'monitor', schoolId } = req.body;

  if (!name || !email || !password)
    return res.status(400).json({ error: 'name, email and password are required' });

  if (!['monitor', 'public'].includes(role))
    return res.status(400).json({ error: 'Self-registration is allowed for monitor and public roles only' });

  if (password.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters' });

  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, school_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, role, school_id`,
      [name.trim(), email.toLowerCase().trim(), hash, role, schoolId || null]
    );
    const user  = rows[0];
    const token = signToken(user);
    res.status(201).json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, schoolId: user.school_id } });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already registered' });
    console.error('register:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/auth/login ───────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'email and password are required' });

  try {
    const { rows } = await pool.query(
      'SELECT * FROM users WHERE email = $1 AND is_active = TRUE',
      [email.toLowerCase().trim()]
    );
    if (!rows.length)
      return res.status(401).json({ error: 'Invalid email or password' });

    const user = rows[0];
    const ok   = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

    const token = signToken(user);
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, schoolId: user.school_id }
    });
  } catch (err) {
    console.error('login:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/auth/me ───────────────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, email, role, school_id FROM users WHERE id = $1 AND is_active = TRUE',
      [req.user.id]
    );
    if (!rows.length) return res.status(401).json({ error: 'User not found' });
    const u = rows[0];
    res.json({ id: u.id, name: u.name, email: u.email, role: u.role, schoolId: u.school_id });
  } catch (err) {
    console.error('me:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PATCH /api/auth/password ───────────────────────────────────────────────
router.patch('/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword)
    return res.status(400).json({ error: 'currentPassword and newPassword are required' });
  if (newPassword.length < 8)
    return res.status(400).json({ error: 'New password must be at least 8 characters' });

  try {
    const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });

    const ok = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!ok) return res.status(401).json({ error: 'Current password is incorrect' });

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('change-password:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/auth/create-user  (cerc_analyst only) ───────────────────────
// Create school_admin or cerc_analyst accounts
router.post('/create-user', requireAuth, async (req, res) => {
  if (req.user.role !== 'cerc_analyst')
    return res.status(403).json({ error: 'Only CERC analysts can create privileged accounts' });

  const { name, email, password, role, schoolId } = req.body;
  if (!['school_admin','cerc_analyst','monitor','public'].includes(role))
    return res.status(400).json({ error: 'Invalid role' });

  try {
    const hash = await bcrypt.hash(password || 'ChangeMe123!', 10);
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, school_id)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, name, email, role, school_id`,
      [name.trim(), email.toLowerCase().trim(), hash, role, schoolId || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already registered' });
    console.error('create-user:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/auth/users  (cerc_analyst only) ───────────────────────────────
router.get('/users', requireAuth, async (req, res) => {
  if (req.user.role !== 'cerc_analyst')
    return res.status(403).json({ error: 'Forbidden' });
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.school_id, u.is_active, u.created_at,
              s.name AS school_name
       FROM users u LEFT JOIN schools s ON s.id = u.school_id
       ORDER BY u.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error('users:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PATCH /api/auth/users/:id  (cerc_analyst only) ─────────────────────────
router.patch('/users/:id', requireAuth, async (req, res) => {
  if (req.user.role !== 'cerc_analyst')
    return res.status(403).json({ error: 'Forbidden' });
  const { is_active } = req.body;
  try {
    const { rows } = await pool.query(
      'UPDATE users SET is_active=$1 WHERE id=$2 RETURNING id,name,email,role,is_active',
      [is_active, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('patch-user:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
