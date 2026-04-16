# EduCheck v2 — Auth Upgrade: Server Commands
# Run these on your Digital Ocean Droplet (root@educheckapp)
# ════════════════════════════════════════════════════════════

# ── STEP 1: Pull updated files ───────────────────────────────
cd /opt/educheckapp

# Option A — if using git:
git pull

# Option B — if uploading manually (run from your local machine):
# scp -r ./educheck/backend/* root@YOUR_IP:/opt/educheckapp/backend/
# scp ./educheck/frontend/index.html root@YOUR_IP:/opt/educheckapp/index.html


# ── STEP 2: Generate a secure JWT secret ─────────────────────
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
# Copy the output — you'll paste it into .env below


# ── STEP 3: Update .env with JWT_SECRET ──────────────────────
nano /opt/educheckapp/.env
# Add this line (paste your generated secret):
#   JWT_SECRET=your_64_char_hex_string_here
# Save: Ctrl+O  Exit: Ctrl+X


# ── STEP 4: Install new npm packages ─────────────────────────
cd /opt/educheckapp
npm install --omit=dev
# This installs: bcryptjs, jsonwebtoken (new) + existing packages


# ── STEP 5: Run the auth migration on the database ───────────
# This adds the users, issue_updates tables and a default admin account
psql "$DATABASE_URL" -f /opt/educheckapp/db/migrate_auth.sql

# Verify the tables were created:
psql "$DATABASE_URL" -c "\dt"
# You should see: schools, questions, question_options, submissions,
#                 submission_answers, users, issue_updates

# Verify the default admin was created:
psql "$DATABASE_URL" -c "SELECT name, email, role FROM users;"


# ── STEP 6: Restart the API ───────────────────────────────────
systemctl restart educheck-api
systemctl status  educheck-api    # should say "active (running)"

# Tail logs to confirm startup:
journalctl -u educheck-api -n 20


# ── STEP 7: Test auth endpoints ──────────────────────────────
# Login as the default CERC analyst:
curl -s -X POST https://educheck.cd/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@cerc.cd","password":"CercAdmin2025!"}' | python3 -m json.tool

# You should get back a { token, user } response.

# Test a protected route with the token:
TOKEN="paste_your_token_here"
curl -s https://educheck.cd/api/auth/me \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool


# ── STEP 8: Change the default admin password ────────────────
# IMPORTANT: Do this immediately after verifying login works.
curl -s -X PATCH https://educheck.cd/api/auth/password \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"currentPassword":"CercAdmin2025!","newPassword":"YourNewSecurePassword123!"}' \
  | python3 -m json.tool


# ── STEP 9: Verify the full site ─────────────────────────────
# Open https://educheck.cd in your browser.
# You should see the EduCheck login screen.
# Log in with admin@cerc.cd and your new password.
# You'll land on the CERC Analyst Dashboard.


# ── QUICK REFERENCE: Role permissions ────────────────────────
#
#  Role            | Self-register? | Default landing page
#  ─────────────────────────────────────────────────────────
#  public          | Yes            | Public aggregate stats
#  monitor         | Yes            | Home + school map
#  school_admin    | No (CERC only) | School admin dashboard
#  cerc_analyst    | No (CERC only) | Analyst dashboard
#
#  To create a school_admin or cerc_analyst account:
#  Log in as cerc_analyst → Analyst tab → "+ Create User"
