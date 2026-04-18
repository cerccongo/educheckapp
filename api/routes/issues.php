<?php
// ══════════════════════════════════════════════
//  EduCheck v2 — api/routes/issues.php
//  Équivalent de issueRoutes.js
// ══════════════════════════════════════════════

$sub = preg_replace('#^/issues#', '', $uri);

match(true) {

    // GET /issues/school/:schoolId
    preg_match('#^/school/(\d+)$#', $sub, $sm) > 0 && $method === 'GET' => (function() use ($sm) {
        $auth = requireRole('school_admin', 'cerc_analyst');
        $schoolId = (int)$sm[1];

        if ($auth['role'] === 'school_admin' && (int)($auth['schoolId'] ?? 0) !== $schoolId)
            jsonError('You can only view your own school', 403);

        $stmt = db()->prepare(
            "SELECT
                s.id AS submission_id, s.form_type, s.submitted_at,
                s.problem_count, s.ok_count, s.monitor_name,
                COALESCE(
                  (SELECT iu.status FROM issue_updates iu
                   WHERE iu.submission_id = s.id
                   ORDER BY iu.created_at DESC LIMIT 1),
                  'pending'
                ) AS latest_status,
                (SELECT iu.note FROM issue_updates iu
                 WHERE iu.submission_id = s.id
                 ORDER BY iu.created_at DESC LIMIT 1) AS latest_note,
                (SELECT iu.created_at FROM issue_updates iu
                 WHERE iu.submission_id = s.id
                 ORDER BY iu.created_at DESC LIMIT 1) AS last_updated
             FROM submissions s
             WHERE s.school_id = ?
             ORDER BY s.submitted_at DESC"
        );
        $stmt->execute([$schoolId]);
        jsonOut($stmt->fetchAll());
    })(),

    // GET /issues/:submissionId
    preg_match('#^/(\d+)$#', $sub, $im) > 0 && $method === 'GET' => (function() use ($im) {
        $auth = requireAuth();
        $submissionId = (int)$im[1];

        $stmt = db()->prepare('SELECT * FROM submissions WHERE id = ?');
        $stmt->execute([$submissionId]);
        $sub_ = $stmt->fetch();
        if (!$sub_) jsonError('Submission not found', 404);

        if ($auth['role'] === 'monitor' && (int)$sub_['user_id'] !== (int)$auth['sub'])
            jsonError('Forbidden', 403);
        if ($auth['role'] === 'school_admin' && (int)$sub_['school_id'] !== (int)($auth['schoolId'] ?? 0))
            jsonError('Forbidden', 403);

        $stmt2 = db()->prepare(
            "SELECT iu.*, u.name AS updated_by
             FROM issue_updates iu
             JOIN users u ON u.id = iu.user_id
             WHERE iu.submission_id = ?
             ORDER BY iu.created_at ASC"
        );
        $stmt2->execute([$submissionId]);
        jsonOut($stmt2->fetchAll());
    })(),

    // POST /issues/:submissionId
    preg_match('#^/(\d+)$#', $sub, $im) > 0 && $method === 'POST' => (function() use ($im) {
        $auth  = requireRole('school_admin', 'cerc_analyst');
        $subId = (int)$im[1];
        $b     = body();
        $status = $b['status'] ?? '';
        $valid  = ['acknowledged', 'in_progress', 'resolved', 'rejected'];

        if (!in_array($status, $valid, true))
            jsonError('status must be one of: ' . implode(', ', $valid));

        $stmt = db()->prepare('SELECT school_id FROM submissions WHERE id = ?');
        $stmt->execute([$subId]);
        $row = $stmt->fetch();
        if (!$row) jsonError('Submission not found', 404);

        if ($auth['role'] === 'school_admin' && (int)$row['school_id'] !== (int)($auth['schoolId'] ?? 0))
            jsonError('You can only update issues for your school', 403);

        $ins = db()->prepare(
            'INSERT INTO issue_updates (submission_id, user_id, status, note)
             VALUES (?, ?, ?, ?)
             RETURNING *'
        );
        $ins->execute([$subId, $auth['sub'], $status, $b['note'] ?? null]);
        jsonOut($ins->fetch(), 201);
    })(),

    default => jsonError('Issues route not found', 404),
};
