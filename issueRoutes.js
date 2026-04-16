// backend/routes/issueRoutes.js
const express  = require('express');
const { Pool } = require('pg');
const { requireRole, requireAuth } = require('../middleware/auth');

const router = express.Router();
const pool   = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// ── GET /api/issues/:submissionId  ─────────────────────────────────────────
// Get all updates for a submission
// Visible to: school_admin (own school), cerc_analyst, monitor (own submissions)
router.get('/:submissionId', requireAuth, async (req, res) => {
  try {
    // Verify submission exists and user has access
    const { rows: subs } = await pool.query(
      'SELECT * FROM submissions WHERE id = $1', [req.params.submissionId]
    );
    if (!subs.length) return res.status(404).json({ error: 'Submission not found' });
    const sub = subs[0];

    const u = req.user;
    if (u.role === 'monitor'       && sub.user_id !== u.id)    return res.status(403).json({ error: 'Forbidden' });
    if (u.role === 'school_admin'  && sub.school_id !== u.schoolId) return res.status(403).json({ error: 'Forbidden' });

    const { rows } = await pool.query(
      `SELECT iu.*, u.name AS updated_by
       FROM issue_updates iu
       JOIN users u ON u.id = iu.user_id
       WHERE iu.submission_id = $1
       ORDER BY iu.created_at ASC`,
      [req.params.submissionId]
    );
    res.json(rows);
  } catch (err) {
    console.error('get-issues:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/issues/:submissionId  ───────────────────────────────────────
// Add a status update (school_admin or cerc_analyst only)
router.post('/:submissionId', requireRole('school_admin', 'cerc_analyst'), async (req, res) => {
  const { status, note } = req.body;
  const validStatuses = ['acknowledged', 'in_progress', 'resolved', 'rejected'];
  if (!validStatuses.includes(status))
    return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });

  try {
    const { rows: subs } = await pool.query(
      'SELECT school_id FROM submissions WHERE id = $1', [req.params.submissionId]
    );
    if (!subs.length) return res.status(404).json({ error: 'Submission not found' });

    // school_admin can only update submissions for their school
    if (req.user.role === 'school_admin' && subs[0].school_id !== req.user.schoolId)
      return res.status(403).json({ error: 'You can only update issues for your school' });

    const { rows } = await pool.query(
      `INSERT INTO issue_updates (submission_id, user_id, status, note)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [req.params.submissionId, req.user.id, status, note || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('post-issue:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/issues/school/:schoolId  ────────────────────────────────────
// Latest status for all submissions of a school
router.get('/school/:schoolId', requireRole('school_admin', 'cerc_analyst'), async (req, res) => {
  const u = req.user;
  if (u.role === 'school_admin' && u.schoolId !== parseInt(req.params.schoolId))
    return res.status(403).json({ error: 'You can only view your own school' });

  try {
    const { rows } = await pool.query(
      `SELECT
          s.id AS submission_id, s.form_type, s.submitted_at,
          s.problem_count, s.ok_count, s.monitor_name,
          COALESCE(
            (SELECT iu.status FROM issue_updates iu
             WHERE iu.submission_id = s.id
             ORDER BY iu.created_at DESC LIMIT 1),
            'pending'
          ) AS latest_status,
          (SELECT iu.note FROM issue_updates iu
           WHERE iu.submission_id = s.id
           ORDER BY iu.created_at DESC LIMIT 1) AS latest_note,
          (SELECT iu.created_at FROM issue_updates iu
           WHERE iu.submission_id = s.id
           ORDER BY iu.created_at DESC LIMIT 1) AS last_updated
       FROM submissions s
       WHERE s.school_id = $1
       ORDER BY s.submitted_at DESC`,
      [req.params.schoolId]
    );
    res.json(rows);
  } catch (err) {
    console.error('school-issues:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
