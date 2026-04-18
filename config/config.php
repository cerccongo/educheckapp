<?php
// ══════════════════════════════════════════════
//  EduCheck v2 — config/config.php
//  Chargé en premier par tous les fichiers API
// ══════════════════════════════════════════════

// ── Chargement du .env ──────────────────────────────────────────────────────
function loadEnv(string $path): void {
    if (!file_exists($path)) return;
    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        if (str_starts_with(trim($line), '#')) continue;
        [$key, $val] = array_map('trim', explode('=', $line, 2));
        if (!array_key_exists($key, $_ENV)) {
            putenv("$key=$val");
            $_ENV[$key] = $val;
        }
    }
}
loadEnv(__DIR__ . '/../.env');

// ── Constantes ──────────────────────────────────────────────────────────────
define('APP_ENV',       getenv('APP_ENV')       ?: 'production');
define('JWT_SECRET',    getenv('JWT_SECRET')    ?: '');
define('JWT_EXPIRES',   (int)(getenv('JWT_EXPIRES') ?: 86400 * 7)); // 7 jours
define('ALLOWED_ORIGIN',getenv('ALLOWED_ORIGIN') ?: '*');
define('DB_DSN',        getenv('DATABASE_URL')  ?: '');

if (APP_ENV === 'production') {
    ini_set('display_errors', '0');
    error_reporting(0);
} else {
    ini_set('display_errors', '1');
    error_reporting(E_ALL);
}

// ── Connexion PDO (singleton) ───────────────────────────────────────────────
function db(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;

    $dsn = DB_DSN;
    // Convertir postgres://user:pass@host:5432/dbname → PDO DSN
    if (str_starts_with($dsn, 'postgres://') || str_starts_with($dsn, 'postgresql://')) {
        $parsed = parse_url($dsn);
        $host   = $parsed['host'];
        $port   = $parsed['port'] ?? 5432;
        $dbname = ltrim($parsed['path'], '/');
        $user   = $parsed['user'];
        $pass   = $parsed['pass'];
        $dsn    = "pgsql:host=$host;port=$port;dbname=$dbname";
        $opts   = [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ];
        if (APP_ENV === 'production') {
            $opts[PDO::PGSQL_ATTR_DISABLE_PREPARES] = true;
        }
        $pdo = new PDO($dsn, $user, $pass, $opts);
    } else {
        $pdo = new PDO($dsn, null, null, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
    }
    return $pdo;
}

// ── CORS ────────────────────────────────────────────────────────────────────
header('Access-Control-Allow-Origin: '  . ALLOWED_ORIGIN);
header('Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function jsonOut(mixed $data, int $code = 200): never {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function jsonError(string $message, int $code = 400): never {
    jsonOut(['error' => $message], $code);
}

function body(): array {
    static $parsed = null;
    if ($parsed !== null) return $parsed;
    $raw    = file_get_contents('php://input');
    $parsed = json_decode($raw, true) ?? [];
    return $parsed;
}

function method(): string {
    return $_SERVER['REQUEST_METHOD'];
}
