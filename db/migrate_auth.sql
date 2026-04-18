-- ══════════════════════════════════════════════════
--  EduCheck v2 PHP — Migration Auth
--  psql $DATABASE_URL -f db/migrate_auth.sql
--  Compatible PHP password_hash(PASSWORD_BCRYPT)
-- ══════════════════════════════════════════════════

-- ── USERS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL      PRIMARY KEY,
  name          TEXT        NOT NULL,
  email         TEXT        NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  role          TEXT        NOT NULL DEFAULT 'monitor'
                            CHECK (role IN ('monitor','school_admin','cerc_analyst','public')),
  school_id     INT         REFERENCES schools(id) ON DELETE SET NULL,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role  ON users(role);

-- ── Lier les soumissions à l'utilisateur ───────────
ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS user_id INT REFERENCES users(id) ON DELETE SET NULL;

-- ── ISSUE UPDATES ───────────────────────────────────
CREATE TABLE IF NOT EXISTS issue_updates (
  id            BIGSERIAL   PRIMARY KEY,
  submission_id BIGINT      NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  user_id       INT         NOT NULL REFERENCES users(id),
  status        TEXT        NOT NULL
                            CHECK (status IN ('acknowledged','in_progress','resolved','rejected')),
  note          TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_issue_updates_submission ON issue_updates(submission_id);

-- ── FEEDBACK ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feedback (
  id            BIGSERIAL   PRIMARY KEY,
  school_id     INT         REFERENCES schools(id) ON DELETE CASCADE,
  user_id       INT         REFERENCES users(id) ON DELETE SET NULL,
  category      TEXT        NOT NULL DEFAULT 'general',
  message       TEXT        NOT NULL,
  is_reviewed   BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_school    ON feedback(school_id);
CREATE INDEX IF NOT EXISTS idx_feedback_reviewed  ON feedback(is_reviewed);

-- ── SEED : compte admin CERC par défaut ─────────────
-- Mot de passe : CercAdmin2025!
-- Hash PHP password_hash('CercAdmin2025!', PASSWORD_BCRYPT, ['cost'=>10])
-- IMPORTANT : changer immédiatement après le premier déploiement
INSERT INTO users (name, email, password_hash, role)
VALUES (
  'CERC Admin',
  'admin@cerc.cd',
  '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
  'cerc_analyst'
) ON CONFLICT (email) DO NOTHING;
