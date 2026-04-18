<?php
// ══════════════════════════════════════════════
//  EduCheck v2 — api/routes/schools.php
// ══════════════════════════════════════════════

$auth     = attachUser();
$isPublic = !$auth || $auth['role'] === 'public';
$id       = $GLOBALS['routeId'] ?? null;

// GET /schools/names — liste publique pour le dropdown
if ($uri === '/schools/names') {
    $rows = db()->query('SELECT id, name, location, province FROM schools ORDER BY name')->fetchAll();
    jsonOut($rows);
}

// GET /schools/:id — détail d'une école (auth requis)
if ($id !== null) {
    requireAuth();
    $stmt = db()->prepare(
        'SELECT id, name, type, location, province,
                lat::float, lng::float,
                students, girls, boys,
                monitored_by, last_monitoring, budget,
                description, photo_url, monitors_list
         FROM schools WHERE id = ?'
    );
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) jsonError('School not found', 404);
    jsonOut($row);
}

// GET /schools — anonymisé pour public, complet pour auth
if ($isPublic) {
    $row = db()->query(
        'SELECT COUNT(*)::int AS total_schools,
                COUNT(DISTINCT province)::int AS total_provinces,
                SUM(students)::int AS total_students,
                SUM(girls)::int AS total_girls,
                SUM(boys)::int AS total_boys
         FROM schools'
    )->fetch();
    jsonOut(['anonymized' => true, 'stats' => $row]);
}

$rows = db()->query(
    'SELECT id, name, type, location, province,
            lat::float, lng::float,
            students, girls, boys,
            monitored_by, last_monitoring, budget,
            description, photo_url, monitors_list
     FROM schools ORDER BY id'
)->fetchAll();
jsonOut($rows);
