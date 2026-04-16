// ══════════════════════════════════════════════
//  EduCheck API  –  server.js
// ══════════════════════════════════════════════
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const { Pool } = require('pg');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Database ───────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }   // required for Digital Ocean managed DB
    : false,
});

// ── Middleware ─────────────────────────────────
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
}));
app.use(express.json());

// ── Health Check ───────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ════════════════════════════════════════════════
//  SCHOOLS
// ════════════════════════════════════════════════

// GET /api/schools  –  list all
app.get('/api/schools', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        id, name, type, location, province,
        lat::float, lng::float,
        students, girls, boys,
        monitored_by, last_monitoring, budget,
        description, photo_url,
        monitors_list
      FROM schools
      ORDER BY id
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /api/schools/:id  –  single school
app.get('/api/schools/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
        id, name, type, location, province,
        lat::float, lng::float,
        students, girls, boys,
        monitored_by, last_monitoring, budget,
        description, photo_url,
        monitors_list
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

// ════════════════════════════════════════════════
//  QUESTIONS
// ════════════════════════════════════════════════

// GET /api/questions/:formType  –  questions + options for a form type
// formType: 'service' | 'infrastructure' | 'survey'
app.get('/api/questions/:formType', async (req, res) => {
  const { formType } = req.params;
  const validTypes = ['service', 'infrastructure', 'survey'];
  if (!validTypes.includes(formType)) {
    return res.status(400).json({ error: 'Invalid form type' });
  }

  try {
    // Fetch questions
    const { rows: questions } = await pool.query(
      `SELECT id, cat, q_en, q_fr, note_en, note_fr, question_type
       FROM questions
       WHERE form_type = $1
       ORDER BY sort_order`,
      [formType]
    );

    // Fetch all options for these questions in one query
    const qids = questions.map(q => q.id);
    const { rows: options } = await pool.query(
      `SELECT question_id, label_en, label_fr, is_problem, is_partial, is_neutral
       FROM question_options
       WHERE question_id = ANY($1)
       ORDER BY question_id, sort_order`,
      [qids]
    );

    // Group options by question_id
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

    // Shape the response to match the format the frontend expects
    const result = questions.map(q => ({
      id:   q.id,
      cat:  q.cat,
      type: q.question_type,
      q:    { en: q.q_en, fr: q.q_fr },
      note: q.note_en ? { en: q.note_en, fr: q.note_fr } : undefined,
      options: optsByQ[q.id] || [],
    }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ════════════════════════════════════════════════
//  SUBMISSIONS
// ════════════════════════════════════════════════

// GET /api/submissions  –  all submissions (with school info)
app.get('/api/submissions', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        s.id, s.form_type, s.monitor_name,
        s.problem_count, s.ok_count,
        s.submitted_at,
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
          ) FILTER (WHERE sa.id IS NOT NULL),
          '[]'
        ) AS answers
      FROM submissions s
      JOIN schools sc ON sc.id = s.school_id
      LEFT JOIN submission_answers sa ON sa.submission_id = s.id
      GROUP BY s.id, sc.id, sc.name, sc.location, sc.province
      ORDER BY s.submitted_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /api/submissions/:id  –  single submission
app.get('/api/submissions/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.*, sc.name AS school_name, sc.location AS school_location
       FROM submissions s
       JOIN schools sc ON sc.id = s.school_id
       WHERE s.id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Submission not found' });

    const { rows: answers } = await pool.query(
      `SELECT question_id, label_en, label_fr, is_problem, is_partial, is_neutral, is_free_text
       FROM submission_answers WHERE submission_id = $1 ORDER BY id`,
      [req.params.id]
    );

    res.json({ ...rows[0], answers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/submissions  –  save a new submission
//
// Body shape:
// {
//   schoolId:    number,
//   formType:    'service' | 'infrastructure' | 'survey',
//   monitorName: string,
//   answers: {
//     [questionId]: {
//       label:      { en: string, fr: string },
//       isProblem:  boolean,
//       isPartial:  boolean,
//       isNeutral:  boolean,
//       isFreeText: boolean
//     }
//   }
// }
app.post('/api/submissions', async (req, res) => {
  const { schoolId, formType, monitorName, answers } = req.body;

  if (!schoolId || !formType || !answers) {
    return res.status(400).json({ error: 'schoolId, formType and answers are required' });
  }

  const problemCount = Object.values(answers).filter(a => a.isProblem).length;
  const okCount = Object.values(answers).filter(a => !a.isProblem && !a.isNeutral && !a.isFreeText).length;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [sub] } = await client.query(
      `INSERT INTO submissions (school_id, form_type, monitor_name, problem_count, ok_count)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [schoolId, formType, monitorName || null, problemCount, okCount]
    );

    for (const [qid, ans] of Object.entries(answers)) {
      await client.query(
        `INSERT INTO submission_answers
           (submission_id, question_id, label_en, label_fr,
            is_problem, is_partial, is_neutral, is_free_text)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          sub.id, qid,
          ans.label?.en || null, ans.label?.fr || null,
          ans.isProblem  || false,
          ans.isPartial  || false,
          ans.isNeutral  || false,
          ans.isFreeText || false,
        ]
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
});

// DELETE /api/submissions/:id  –  remove a submission
app.delete('/api/submissions/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM submissions WHERE id = $1', [req.params.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Submission not found' });
    res.json({ deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ── Start ──────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅  EduCheck API listening on port ${PORT}`);
  console.log(`   Environment : ${process.env.NODE_ENV || 'development'}`);
});
