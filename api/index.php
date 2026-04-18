<?php
// ══════════════════════════════════════════════════════════════════
//  EduCheck v2  –  api/index.php   (Front Controller)
//  Remplace server.js — routes toutes les requêtes API
// ══════════════════════════════════════════════════════════════════

require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../middleware/auth.php';

// ── Extraction du chemin sans query string ──────────────────────────────────
$uri    = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$uri    = '/' . ltrim($uri, '/');
$method = method();

// Normaliser : supprimer /api/  si servi depuis sous-dossier
$uri = preg_replace('#^/api#', '', $uri) ?: '/';

// ── Router ───────────────────────────────────────────────────────────────────
match(true) {

    // Health
    $uri === '/health' && $method === 'GET'
        => jsonOut(['status' => 'ok', 'version' => '2.0.0']),

    // Auth
    str_starts_with($uri, '/auth')
        => require __DIR__ . '/routes/auth.php',

    // Issues
    str_starts_with($uri, '/issues')
        => require __DIR__ . '/routes/issues.php',

    // Schools
    $uri === '/schools' && $method === 'GET'
        => require __DIR__ . '/routes/schools.php',

    $uri === '/schools/names' && $method === 'GET'
        => require __DIR__ . '/routes/schools.php',

    preg_match('#^/schools/(\d+)$#', $uri, $m) > 0
        => (function() use ($m) {
            $GLOBALS['routeId'] = (int)$m[1];
            require __DIR__ . '/routes/schools.php';
        })(),

    // Public stats
    $uri === '/stats/public' && $method === 'GET'
        => require __DIR__ . '/routes/stats.php',

    // Questions
    preg_match('#^/questions/(service|infrastructure|survey)$#', $uri, $m) > 0
        => (function() use ($m) {
            $GLOBALS['formType'] = $m[1];
            require __DIR__ . '/routes/questions.php';
        })(),

    // Submissions
    $uri === '/submissions' && in_array($method, ['GET', 'POST'])
        => require __DIR__ . '/routes/submissions.php',

    preg_match('#^/submissions/(\d+)$#', $uri, $m) > 0 && $method === 'DELETE'
        => (function() use ($m) {
            $GLOBALS['routeId'] = (int)$m[1];
            require __DIR__ . '/routes/submissions.php';
        })(),

    // Feedback
    $uri === '/feedback' && in_array($method, ['GET', 'POST'])
        => require __DIR__ . '/routes/feedback.php',

    preg_match('#^/feedback/(\d+)$#', $uri, $m) > 0 && $method === 'PATCH'
        => (function() use ($m) {
            $GLOBALS['routeId'] = (int)$m[1];
            require __DIR__ . '/routes/feedback.php';
        })(),

    default => jsonError('Route not found', 404),
};
