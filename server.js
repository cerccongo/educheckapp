// ══════════════════════════════════════════════════════════
//  EduCheck API v2  –  server.js  (role-based auth)
// ══════════════════════════════════════════════════════════
require('dotenv').config();
const express      = require('express');
const cors         = require('cors');
const { Pool }     = require('pg');
const { attachUser, requireAuth, requireRole } = require('./middleware/auth');
const authRoutes   = require('./routes/authRoutes');
const issueRoutes  = require('./routes/issueRoutes');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Database ────────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }));
app.use(express.json());
app.use(attachUser);          // attach req.user from JWT on every request

// ── Health ──────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', version: '2.0.0' }));

// ── Auth routes ─────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);

// ── Issue update routes ──────────────────────────────────────────────────────
app.use('/api/issues', issueRoutes);

// ════════════════════════════════════════════════════════════════════════════
//  SCHOOLS
//  GET  /api/schools        → public gets anonymized stats; auth gets full list
//  GET  /api/schools/:id    → requires auth
// ════════════════════════════════════════════════════════════════════════════

app.get('/api/schools', async (req, res) => {
  try {
    const isPublic = !req.user || req.user.role === 'public';

    if (isPublic) {
      // Anonymized aggregate only — no school names or locations
      const { rows } = await pool.query(
        `SELECT
           COUNT(*)::int                              AS total_schools,
           COUNT(DISTINCT province)::int             AS total_provinces,
           SUM(students)::int                        AS total_students,
           SUM(girls)::int                           AS total_girls,
           SUM(boys)::int                            AS total_boys
         FROM schools`
      );
      return res.json({ anonymized: true, stats: rows[0] });
    }

    const { rows } = await pool.query(
      `SELECT id, name, type, location, province,
              lat::float, lng::float,
              students, girls, boys,
              monitored_by, last_monitoring, budget,
              description, photo_url, monitors_list
       FROM schools ORDER BY id`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/schools/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, type, location, province,
              lat::float, lng::float,
              students, girls, boys,
              monitored_by, last_monitoring, budget,
              description, photo_url, monitors_list
       FROM schools WHERE id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'School not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
//  PUBLIC AGGREGATE STATS  (for public viewer dashboard)
// ════════════════════════════════════════════════════════════════════════════

app.get('/api/stats/public', async (_req, res) => {
  try {
    const { rows: schoolStats } = await pool.query(
      `SELECT COUNT(*)::int AS total_schools,
              COUNT(DISTINCT province)::int AS total_provinces
       FROM schools`
    );
    const { rows: subStats } = await pool.query(
      `SELECT COUNT(*)::int            AS total_reports,
              SUM(problem_count)::int  AS total_issues,
              SUM(ok_count)::int       AS total_ok
       FROM submissions`
    );
    // Province breakdown — no school names
    const { rows: provinces } = await pool.query(
      `SELECT s.province,
              COUNT(DISTINCT s.id)::int     AS schools,
              COUNT(sub.id)::int            AS reports,
              COALESCE(SUM(sub.problem_count),0)::int AS issues
       FROM schools s
       LEFT JOIN submissions sub ON sub.school_id = s.id
       GROUP BY s.province ORDER BY schools DESC`
    );
    res.json({ ...schoolStats[0], ...subStats[0], provinces });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
//  QUESTIONS
//  Requires at minimum the monitor role (not public)
// ════════════════════════════════════════════════════════════════════════════

app.get('/api/questions/:formType',
  requireRole('monitor', 'school_admin', 'cerc_analyst'),
  async (req, res) => {
    const { formType } = req.params;
    if (!['service','infrastructure','survey'].includes(formType))
      return res.status(400).json({ error: 'Invalid form type' });

    try {
      const { rows: questions } = await pool.query(
        `SELECT id, cat, q_en, q_fr, note_en, note_fr, question_type
         FROM questions WHERE form_type = $1 ORDER BY sort_order`,
        [formType]
      );
      const qids = questions.map(q => q.id);
      const { rows: options } = await pool.query(
        `SELECT question_id, label_en, label_fr, is_problem, is_partial, is_neutral
         FROM question_options WHERE question_id = ANY($1) ORDER BY question_id, sort_order`,
        [qids]
      );
      const optsByQ = {};
      options.forEach(o => {
        if (!optsByQ[o.question_id]) optsByQ[o.question_id] = [];
        optsByQ[o.question_id].push({
          label:     { en: o.label_en, fr: o.label_fr },
          isProblem: o.is_problem,
          isPartial: o.is_partial,
          isNeutral: o.is_neutral,
        });
      });
      res.json(questions.map(q => ({
        id: q.id, cat: q.cat, type: q.question_type,
        q:  { en: q.q_en, fr: q.q_fr },
        note: q.note_en ? { en: q.note_en, fr: q.note_fr } : undefined,
        options: optsByQ[q.id] || [],
      })));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Database error' });
    }
  }
);

// ════════════════════════════════════════════════════════════════════════════
//  SUBMISSIONS
// ════════════════════════════════════════════════════════════════════════════

// GET /api/submissions
// - cerc_analyst: all submissions
// - school_admin: submissions for their school
// - monitor: only their own submissions
app.get('/api/submissions', requireAuth, async (req, res) => {
  try {
    const u = req.user;
    let whereClause = '';
    const params = [];

    if (u.role === 'monitor') {
      whereClause = 'WHERE s.user_id = $1';
      params.push(u.id);
    } else if (u.role === 'school_admin') {
      whereClause = 'WHERE s.school_id = $1';
      params.push(u.schoolId);
    }

    const { rows } = await pool.query(`
      SELECT
        s.id, s.form_type, s.monitor_name, s.problem_count, s.ok_count,
        s.submitted_at, s.user_id,
        sc.id   AS school_id,
        sc.name AS school_name,
        sc.location AS school_location,
        sc.province AS school_province,
        COALESCE(
          json_agg(
            json_build_object(
              'questionId', sa.question_id,
              'labelEn',    sa.label_en,
              'labelFr',    sa.label_fr,
              'isProblem',  sa.is_problem,
              'isPartial',  sa.is_partial,
              'isNeutral',  sa.is_neutral,
              'isFreeText', sa.is_free_text
            ) ORDER BY sa.id
          ) FILTER (WHERE sa.id IS NOT NULL), '[]'
        ) AS answers,
        COALESCE(
          (SELECT iu.status FROM issue_updates iu
           WHERE iu.submission_id = s.id
           ORDER BY iu.created_at DESC LIMIT 1),
          'pending'
        ) AS issue_status
      FROM submissions s
      JOIN schools sc ON sc.id = s.school_id
      LEFT JOIN submission_answers sa ON sa.submission_id = s.id
      ${whereClause}
      GROUP BY s.id, sc.id, sc.name, sc.location, sc.province
      ORDER BY s.submitted_at DESC
    `, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/submissions  —  monitors only
app.post('/api/submissions',
  requireRole('monitor'),
  async (req, res) => {
    const { schoolId, formType, monitorName, answers } = req.body;
    if (!schoolId || !formType || !answers)
      return res.status(400).json({ error: 'schoolId, formType and answers are required' });

    const problemCount = Object.values(answers).filter(a => a.isProblem).length;
    const okCount      = Object.values(answers).filter(a => !a.isProblem && !a.isNeutral && !a.isFreeText).length;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: [sub] } = await client.query(
        `INSERT INTO submissions (school_id, form_type, monitor_name, problem_count, ok_count, user_id)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [schoolId, formType, monitorName || null, problemCount, okCount, req.user.id]
      );
      for (const [qid, ans] of Object.entries(answers)) {
        await client.query(
          `INSERT INTO submission_answers
             (submission_id, question_id, label_en, label_fr,
              is_problem, is_partial, is_neutral, is_free_text)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [sub.id, qid,
           ans.label?.en || null, ans.label?.fr || null,
           ans.isProblem || false, ans.isPartial || false,
           ans.isNeutral || false, ans.isFreeText || false]
        );
      }
      await client.query('COMMIT');
      res.status(201).json({ id: sub.id, submittedAt: sub.submitted_at });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(err);
      res.status(500).json({ error: 'Database error' });
    } finally {
      client.release();
    }
  }
);

// DELETE /api/submissions/:id  —  cerc_analyst only
app.delete('/api/submissions/:id',
  requireRole('cerc_analyst'),
  async (req, res) => {
    try {
      const { rowCount } = await pool.query('DELETE FROM submissions WHERE id = $1', [req.params.id]);
      if (!rowCount) return res.status(404).json({ error: 'Submission not found' });
      res.json({ deleted: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Database error' });
    }
  }
);

// ── Start ───────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅  EduCheck API v2 on port ${PORT}  [${process.env.NODE_ENV || 'development'}]`);
});
