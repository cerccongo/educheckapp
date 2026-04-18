<?php
// ══════════════════════════════════════════════
//  EduCheck v2 — api/routes/feedback.php
// ══════════════════════════════════════════════

$id = $GLOBALS['routeId'] ?? null;

// PATCH /feedback/:id  — cerc_analyst seulement
if ($id !== null && $method === 'PATCH') {
    requireRole('cerc_analyst');
    $stmt = db()->prepare('UPDATE feedback SET is_reviewed = TRUE WHERE id = ? RETURNING id');
    $stmt->execute([$id]);
    if (!$stmt->fetch()) jsonError('Not found', 404);
    jsonOut(['reviewed' => true]);
}

// GET /feedback  — cerc_analyst seulement
if ($method === 'GET') {
    requireRole('cerc_analyst');
    $rows = db()->query(
        "SELECT f.*, u.name AS user_name, u.role AS user_role, s.name AS school_name
         FROM feedback f
         LEFT JOIN users u  ON u.id = f.user_id
         LEFT JOIN schools s ON s.id = f.school_id
         ORDER BY f.created_at DESC"
    )->fetchAll();
    jsonOut($rows);
}

// POST /feedback  — auth requis
if ($method === 'POST') {
    $auth = requireAuth();
    $b    = body();
    $msg  = trim($b['message'] ?? '');
    if (!$msg) jsonError('message is required');

    $stmt = db()->prepare(
        'INSERT INTO feedback (school_id, user_id, category, message)
         VALUES (?, ?, ?, ?) RETURNING id, created_at'
    );
    $stmt->execute([
        $b['schoolId'] ?? null,
        $auth['sub'],
        $b['category'] ?? 'general',
        $msg,
    ]);
    $row = $stmt->fetch();
    jsonOut(['id' => $row['id'], 'submitted' => true], 201);
}

jsonError('Method not allowed', 405);
