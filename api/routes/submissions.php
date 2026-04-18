<?php
// ══════════════════════════════════════════════
//  EduCheck v2 — api/routes/submissions.php
// ══════════════════════════════════════════════

$id = $GLOBALS['routeId'] ?? null;

// DELETE /submissions/:id  — cerc_analyst seulement
if ($id !== null && $method === 'DELETE') {
    requireRole('cerc_analyst');
    $stmt = db()->prepare('DELETE FROM submissions WHERE id = ?');
    $stmt->execute([$id]);
    if ($stmt->rowCount() === 0) jsonError('Submission not found', 404);
    jsonOut(['deleted' => true]);
}

// POST /submissions  — monitor seulement
if ($method === 'POST') {
    $auth = requireRole('monitor');
    $b    = body();

    if (empty($b['schoolId']) || empty($b['formType']) || empty($b['answers']))
        jsonError('schoolId, formType and answers are required');

    $answers      = $b['answers'];
    $problemCount = count(array_filter($answers, fn($a) => $a['isProblem'] ?? false));
    $okCount      = count(array_filter($answers, fn($a) =>
        !($a['isProblem'] ?? false) && !($a['isNeutral'] ?? false) && !($a['isFreeText'] ?? false)
    ));

    $pdo = db();
    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare(
            'INSERT INTO submissions (school_id, form_type, monitor_name, problem_count, ok_count, user_id)
             VALUES (?,?,?,?,?,?) RETURNING id, submitted_at'
        );
        $stmt->execute([
            $b['schoolId'], $b['formType'],
            $b['monitorName'] ?? null,
            $problemCount, $okCount,
            $auth['sub'],
        ]);
        $sub = $stmt->fetch();

        $ins = $pdo->prepare(
            'INSERT INTO submission_answers
               (submission_id, question_id, label_en, label_fr,
                is_problem, is_partial, is_neutral, is_free_text)
             VALUES (?,?,?,?,?,?,?,?)'
        );
        foreach ($answers as $qid => $ans) {
            $ins->execute([
                $sub['id'], $qid,
                $ans['label']['en'] ?? null,
                $ans['label']['fr'] ?? null,
                (bool)($ans['isProblem']  ?? false),
                (bool)($ans['isPartial']  ?? false),
                (bool)($ans['isNeutral']  ?? false),
                (bool)($ans['isFreeText'] ?? false),
            ]);
        }
        $pdo->commit();
        jsonOut(['id' => $sub['id'], 'submittedAt' => $sub['submitted_at']], 201);
    } catch (\Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
}

// GET /submissions
$auth = requireAuth();
$u    = $auth;

$where  = '';
$params = [];
if ($u['role'] === 'monitor') {
    $where  = 'WHERE s.user_id = ?';
    $params = [$u['sub']];
} elseif ($u['role'] === 'school_admin') {
    $where  = 'WHERE s.school_id = ?';
    $params = [$u['schoolId']];
}

$stmt = db()->prepare("
    SELECT
      s.id, s.form_type, s.monitor_name, s.problem_count, s.ok_count,
      s.submitted_at, s.user_id,
      sc.id   AS school_id,
      sc.name AS school_name,
      sc.location AS school_location,
      sc.province AS school_province,
      COALESCE(
        (SELECT iu.status FROM issue_updates iu
         WHERE iu.submission_id = s.id
         ORDER BY iu.created_at DESC LIMIT 1),
        'pending'
      ) AS issue_status
    FROM submissions s
    JOIN schools sc ON sc.id = s.school_id
    $where
    ORDER BY s.submitted_at DESC
");
$stmt->execute($params);
$subs = $stmt->fetchAll();

// Charger les answers séparément (évite le json_agg non portable)
$subIds = array_column($subs, 'id');
$answers = [];
if ($subIds) {
    $in   = implode(',', array_fill(0, count($subIds), '?'));
    $aStmt = db()->prepare(
        "SELECT submission_id, question_id, label_en, label_fr,
                is_problem, is_partial, is_neutral, is_free_text
         FROM submission_answers WHERE submission_id IN ($in)"
    );
    $aStmt->execute($subIds);
    foreach ($aStmt->fetchAll() as $row) {
        $answers[$row['submission_id']][] = [
            'questionId' => $row['question_id'],
            'labelEn'    => $row['label_en'],
            'labelFr'    => $row['label_fr'],
            'isProblem'  => (bool)$row['is_problem'],
            'isPartial'  => (bool)$row['is_partial'],
            'isNeutral'  => (bool)$row['is_neutral'],
            'isFreeText' => (bool)$row['is_free_text'],
        ];
    }
}

foreach ($subs as &$s) {
    $s['answers'] = $answers[$s['id']] ?? [];
}

jsonOut($subs);
