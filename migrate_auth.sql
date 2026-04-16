-- ══════════════════════════════════════════════════
--  EduCheck Auth Migration  (run ONCE on existing DB)
--  psql $DATABASE_URL -f db/migrate_auth.sql
-- ══════════════════════════════════════════════════

-- ── USERS ──────────────────────────────────────────
-- role: 'monitor' | 'school_admin' | 'cerc_analyst' | 'public'
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

-- ── Link submissions to the user who submitted ─────
ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS user_id INT REFERENCES users(id) ON DELETE SET NULL;

-- ── ISSUE UPDATES (school admins track resolution) ─
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

-- ── SEED: default CERC analyst account ─────────────
-- Password: CercAdmin2025!  (change immediately in production)
-- bcrypt hash of that password at cost 10:
INSERT INTO users (name, email, password_hash, role)
VALUES (
  'CERC Admin',
  'admin@cerc.cd',
  '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
  'cerc_analyst'
) ON CONFLICT (email) DO NOTHING;
