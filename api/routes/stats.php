<?php
// ══════════════════════════════════════════════
//  EduCheck v2 — api/routes/stats.php
// ══════════════════════════════════════════════

$schoolStats = db()->query(
    'SELECT COUNT(*)::int AS total_schools,
            COUNT(DISTINCT province)::int AS total_provinces
     FROM schools'
)->fetch();

$subStats = db()->query(
    'SELECT COUNT(*)::int           AS total_reports,
            SUM(problem_count)::int AS total_issues,
            SUM(ok_count)::int      AS total_ok
     FROM submissions'
)->fetch();

$provinces = db()->query(
    "SELECT s.province,
            COUNT(DISTINCT s.id)::int        AS schools,
            COUNT(sub.id)::int               AS reports,
            COALESCE(SUM(sub.problem_count),0)::int AS issues
     FROM schools s
     LEFT JOIN submissions sub ON sub.school_id = s.id
     GROUP BY s.province ORDER BY schools DESC"
)->fetchAll();

jsonOut(array_merge($schoolStats, $subStats, ['provinces' => $provinces]));
