# EduCheck v2 PHP — Guide de Déploiement DigitalOcean
# ═══════════════════════════════════════════════════════
# Stack : Ubuntu 24.04 · Apache 2 · PHP 8.3 · PostgreSQL 16
# Serveur cible : root@YOUR_DROPLET_IP
# ═══════════════════════════════════════════════════════

## ──────────────────────────────────────────────────────
## ÉTAPE 0 — Créer le Droplet DigitalOcean
## ──────────────────────────────────────────────────────

# Dans le panel DigitalOcean :
#   Image     : Ubuntu 24.04 LTS x64
#   Taille    : Basic — 2 vCPU / 2 GB RAM (minimum recommandé)
#   Région    : choisir la plus proche (Frankfurt ou Singapour pour la RDC)
#   Auth      : clé SSH (recommandé) ou mot de passe
#   Hostname  : educheckapp

# Pointer votre domaine educheck.cd vers l'IP du Droplet
# (Enregistrement A : educheck.cd → IP_DU_DROPLET)


## ──────────────────────────────────────────────────────
## ÉTAPE 1 — Connexion & mise à jour du système
## ──────────────────────────────────────────────────────

ssh root@YOUR_DROPLET_IP

apt update && apt upgrade -y
timedatectl set-timezone Africa/Kinshasa
echo "✅  Système mis à jour"


## ──────────────────────────────────────────────────────
## ÉTAPE 2 — Installer PHP 8.3 + extensions
## ──────────────────────────────────────────────────────

add-apt-repository ppa:ondrej/php -y
apt update
apt install -y \
    php8.3 \
    php8.3-pgsql \
    php8.3-mbstring \
    php8.3-xml \
    php8.3-curl \
    php8.3-zip \
    php8.3-intl \
    libapache2-mod-php8.3

php -v   # doit afficher PHP 8.3.x

# Vérifier les extensions critiques
php -m | grep -E "pdo_pgsql|mbstring|json"


## ──────────────────────────────────────────────────────
## ÉTAPE 3 — Installer Apache 2
## ──────────────────────────────────────────────────────

apt install -y apache2
a2enmod rewrite headers expires deflate
systemctl enable apache2
systemctl start  apache2

echo "✅  Apache démarré"
curl -s http://localhost | grep -o "Apache"   # doit retourner "Apache"


## ──────────────────────────────────────────────────────
## ÉTAPE 4 — Installer PostgreSQL 16
## ──────────────────────────────────────────────────────

apt install -y postgresql-16 postgresql-client-16
systemctl enable postgresql
systemctl start  postgresql

# Créer la base de données et l'utilisateur
sudo -u postgres psql <<'SQL'
CREATE USER educheck WITH PASSWORD 'CHANGER_CE_MOT_DE_PASSE';
CREATE DATABASE educheck_db OWNER educheck;
GRANT ALL PRIVILEGES ON DATABASE educheck_db TO educheck;
\q
SQL

echo "✅  PostgreSQL configuré"

# Tester la connexion
psql "postgresql://educheck:CHANGER_CE_MOT_DE_PASSE@localhost:5432/educheck_db" -c "\l"


## ──────────────────────────────────────────────────────
## ÉTAPE 5 — Déployer les fichiers EduCheck
## ──────────────────────────────────────────────────────

# Créer le dossier de l'application
mkdir -p /var/www/educheck
chown -R www-data:www-data /var/www/educheck

# ── Option A : Depuis Git ──────────────────────────────
# git clone https://github.com/votre-org/educheck.git /var/www/educheck

# ── Option B : Upload manuel depuis votre machine locale ──────────────────
# Depuis votre ordinateur (PAS depuis le serveur) :
#   scp -r ./educheck-php/* root@YOUR_DROPLET_IP:/var/www/educheck/
#   scp ./index.html         root@YOUR_DROPLET_IP:/var/www/educheck/index.html

# Structure attendue sur le serveur :
# /var/www/educheck/
# ├── index.html           ← frontend SPA (inchangé)
# ├── api/
# │   ├── index.php        ← front controller (remplace server.js)
# │   └── routes/
# │       ├── auth.php
# │       ├── issues.php
# │       ├── schools.php
# │       ├── stats.php
# │       ├── questions.php
# │       ├── submissions.php
# │       └── feedback.php
# ├── config/
# │   └── config.php
# ├── middleware/
# │   └── auth.php
# ├── db/
# │   └── migrate_auth.sql
# ├── .htaccess
# └── .env                 ← à créer (ne jamais commiter !)

ls -la /var/www/educheck/   # vérifier les fichiers


## ──────────────────────────────────────────────────────
## ÉTAPE 6 — Configurer le fichier .env
## ──────────────────────────────────────────────────────

cp /var/www/educheck/.env.example /var/www/educheck/.env
nano /var/www/educheck/.env

# ── Contenu à remplir ──────────────────────────────────
# APP_ENV=production
# DATABASE_URL=postgresql://educheck:VOTRE_MOT_DE_PASSE@localhost:5432/educheck_db
# JWT_SECRET=COLLER_ICI_LA_CLÉ_GÉNÉRÉE_CI-DESSOUS
# JWT_EXPIRES=604800
# ALLOWED_ORIGIN=https://educheck.cd

# Générer un JWT_SECRET sécurisé :
php -r "echo bin2hex(random_bytes(64)) . PHP_EOL;"
# Copier la sortie et la coller dans JWT_SECRET dans le .env

# Protéger le fichier .env
chmod 640 /var/www/educheck/.env
chown www-data:www-data /var/www/educheck/.env


## ──────────────────────────────────────────────────────
## ÉTAPE 7 — Exécuter la migration SQL
## ──────────────────────────────────────────────────────

export DATABASE_URL="postgresql://educheck:VOTRE_MOT_DE_PASSE@localhost:5432/educheck_db"

psql "$DATABASE_URL" -f /var/www/educheck/db/migrate_auth.sql

# Vérifier les tables créées :
psql "$DATABASE_URL" -c "\dt"
# Attendu : schools, questions, question_options, submissions,
#           submission_answers, users, issue_updates, feedback

# Vérifier le compte admin par défaut :
psql "$DATABASE_URL" -c "SELECT name, email, role FROM users;"


## ──────────────────────────────────────────────────────
## ÉTAPE 8 — Configurer le Virtual Host Apache
## ──────────────────────────────────────────────────────

cat > /etc/apache2/sites-available/educheck.conf <<'VHOST'
<VirtualHost *:80>
    ServerName  educheck.cd
    ServerAlias www.educheck.cd
    DocumentRoot /var/www/educheck

    <Directory /var/www/educheck>
        Options -Indexes -MultiViews
        AllowOverride All
        Require all granted
    </Directory>

    # Journaux
    ErrorLog  ${APACHE_LOG_DIR}/educheck_error.log
    CustomLog ${APACHE_LOG_DIR}/educheck_access.log combined
</VirtualHost>
VHOST

# Activer le site et désactiver le site par défaut
a2ensite  educheck.conf
a2dissite 000-default.conf
systemctl reload apache2

echo "✅  Virtual Host configuré"


## ──────────────────────────────────────────────────────
## ÉTAPE 9 — HTTPS avec Let's Encrypt (Certbot)
## ──────────────────────────────────────────────────────

apt install -y certbot python3-certbot-apache
certbot --apache -d educheck.cd -d www.educheck.cd

# Certbot modifie automatiquement educheck.conf pour HTTPS
# Renouvellement automatique (déjà configuré par certbot) :
systemctl status certbot.timer
# Tester le renouvellement :
certbot renew --dry-run


## ──────────────────────────────────────────────────────
## ÉTAPE 10 — Permissions des fichiers
## ──────────────────────────────────────────────────────

chown -R www-data:www-data /var/www/educheck
find /var/www/educheck -type f -exec chmod 644 {} \;
find /var/www/educheck -type d -exec chmod 755 {} \;
chmod 640 /var/www/educheck/.env

echo "✅  Permissions appliquées"


## ──────────────────────────────────────────────────────
## ÉTAPE 11 — Tester l'API
## ──────────────────────────────────────────────────────

# Health check :
curl -s https://educheck.cd/api/health | python3 -m json.tool
# Attendu : { "status": "ok", "version": "2.0.0" }

# Login avec le compte admin par défaut :
curl -s -X POST https://educheck.cd/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@cerc.cd","password":"CercAdmin2025!"}' \
  | python3 -m json.tool
# Attendu : { "token": "...", "user": { "role": "cerc_analyst", ... } }

# Tester la route protégée /me :
TOKEN="COLLER_VOTRE_TOKEN_ICI"
curl -s https://educheck.cd/api/auth/me \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -m json.tool

# Stats publiques :
curl -s https://educheck.cd/api/stats/public | python3 -m json.tool


## ──────────────────────────────────────────────────────
## ÉTAPE 12 — Changer le mot de passe admin par défaut
## ──────────────────────────────────────────────────────
## ⚠️  OBLIGATOIRE — À faire immédiatement après vérification

TOKEN="VOTRE_TOKEN_ICI"
curl -s -X PATCH https://educheck.cd/api/auth/password \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"currentPassword":"CercAdmin2025!","newPassword":"VotreNouveauMotDePasse123!"}' \
  | python3 -m json.tool


## ──────────────────────────────────────────────────────
## ÉTAPE 13 — Vérification finale
## ──────────────────────────────────────────────────────

# 1. Ouvrir https://educheck.cd dans le navigateur
#    → Vous devez voir l'écran de connexion EduCheck
#
# 2. Se connecter avec admin@cerc.cd + votre nouveau mot de passe
#    → Tableau de bord Analyste CERC
#
# 3. Tester l'enregistrement d'un compte "monitor"
# 4. Tester la soumission d'un rapport
# 5. Vérifier les journaux :
apache2ctl -t           # syntaxe Apache OK
tail -f /var/log/apache2/educheck_error.log


## ──────────────────────────────────────────────────────
## COMMANDES DE MAINTENANCE
## ──────────────────────────────────────────────────────

# Redémarrer Apache
systemctl restart apache2

# Voir les erreurs PHP en temps réel
tail -f /var/log/apache2/educheck_error.log

# Sauvegarder la base de données
pg_dump "$DATABASE_URL" > /root/backup_educheck_$(date +%Y%m%d).sql

# Mettre à jour les fichiers (si upload manuel)
# Depuis votre machine locale :
#   scp -r ./educheck-php/api/* root@YOUR_IP:/var/www/educheck/api/
#   scp ./index.html            root@YOUR_IP:/var/www/educheck/index.html


## ──────────────────────────────────────────────────────
## RÉFÉRENCE RAPIDE : Rôles et permissions
## ──────────────────────────────────────────────────────
#
#  Rôle            | Auto-inscription | Page par défaut
#  ─────────────────────────────────────────────────────
#  public          | Oui              | Statistiques publiques
#  monitor         | Oui              | Carte + formulaire
#  school_admin    | Non (CERC)       | Tableau de bord école
#  cerc_analyst    | Non (CERC)       | Tableau de bord analyste
#
#  Créer un school_admin ou cerc_analyst :
#  Se connecter en cerc_analyst → onglet Analyste → "+ Créer utilisateur"


## ──────────────────────────────────────────────────────
## DIFFÉRENCES Node.js → PHP : résumé technique
## ──────────────────────────────────────────────────────
#
#  Node.js / Express         →  PHP 8.3 / Apache
#  ─────────────────────────────────────────────
#  server.js (Express)       →  api/index.php (router match)
#  authRoutes.js             →  api/routes/auth.php
#  issueRoutes.js            →  api/routes/issues.php
#  bcrypt (npm)              →  password_hash(PASSWORD_BCRYPT) natif PHP
#  jsonwebtoken (npm)        →  JWT pur PHP dans middleware/auth.php
#  pg Pool (npm)             →  PDO pgsql natif PHP
#  dotenv (npm)              →  loadEnv() dans config/config.php
#  pm2 / systemd service     →  Apache + mod_php (pas de démon à gérer)
#  package.json / npm        →  aucune dépendance externe requise
