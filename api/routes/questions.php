<?php
// ══════════════════════════════════════════════
//  EduCheck v2 — api/routes/questions.php
// ══════════════════════════════════════════════

requireRole('monitor', 'school_admin', 'cerc_analyst');

$formType = $GLOBALS['formType'];

$stmt = db()->prepare(
    'SELECT id, cat, q_en, q_fr, note_en, note_fr, question_type
     FROM questions WHERE form_type = ? ORDER BY sort_order'
);
$stmt->execute([$formType]);
$questions = $stmt->fetchAll();

if (!$questions) jsonOut([]);

$qids  = array_column($questions, 'id');
$in    = implode(',', array_fill(0, count($qids), '?'));
$stmt2 = db()->prepare(
    "SELECT question_id, label_en, label_fr, is_problem, is_partial, is_neutral
     FROM question_options WHERE question_id IN ($in) ORDER BY question_id, sort_order"
);
$stmt2->execute($qids);
$optRows = $stmt2->fetchAll();

$optsByQ = [];
foreach ($optRows as $o) {
    $optsByQ[$o['question_id']][] = [
        'label'     => ['en' => $o['label_en'], 'fr' => $o['label_fr']],
        'isProblem' => (bool)$o['is_problem'],
        'isPartial' => (bool)$o['is_partial'],
        'isNeutral' => (bool)$o['is_neutral'],
    ];
}

$result = array_map(fn($q) => [
    'id'      => $q['id'],
    'cat'     => $q['cat'],
    'type'    => $q['question_type'],
    'q'       => ['en' => $q['q_en'], 'fr' => $q['q_fr']],
    'note'    => $q['note_en'] ? ['en' => $q['note_en'], 'fr' => $q['note_fr']] : null,
    'options' => $optsByQ[$q['id']] ?? [],
], $questions);

jsonOut($result);
