<?php
// ══════════════════════════════════════════════
//  EduCheck v2 — api/routes/auth.php
//  Équivalent de authRoutes.js
// ══════════════════════════════════════════════

$sub = preg_replace('#^/auth#', '', $uri);

match(true) {

    // POST /auth/register
    $sub === '/register' && $method === 'POST' => (function() {
        $b = body();
        $name     = trim($b['name']     ?? '');
        $email    = strtolower(trim($b['email'] ?? ''));
        $password = $b['password'] ?? '';
        $role     = $b['role']     ?? 'monitor';
        $schoolId = $b['schoolId'] ?? null;

        if (!$name || !$email || !$password)
            jsonError('name, email and password are required');

        if (!in_array($role, ['monitor', 'public'], true))
            jsonError('Self-registration is allowed for monitor and public roles only');

        if (strlen($password) < 8)
            jsonError('Password must be at least 8 characters');

        $hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 10]);

        try {
            $stmt = db()->prepare(
                'INSERT INTO users (name, email, password_hash, role, school_id)
                 VALUES (?, ?, ?, ?, ?)
                 RETURNING id, name, email, role, school_id'
            );
            $stmt->execute([$name, $email, $hash, $role, $schoolId ?: null]);
            $user  = $stmt->fetch();
            $token = signToken($user);
            jsonOut([
                'token' => $token,
                'user'  => [
                    'id'       => $user['id'],
                    'name'     => $user['name'],
                    'email'    => $user['email'],
                    'role'     => $user['role'],
                    'schoolId' => $user['school_id'],
                ],
            ], 201);
        } catch (PDOException $e) {
            if (str_contains($e->getMessage(), '23505'))
                jsonError('Email already registered', 409);
            throw $e;
        }
    })(),

    // POST /auth/login
    $sub === '/login' && $method === 'POST' => (function() {
        $b        = body();
        $email    = strtolower(trim($b['email']    ?? ''));
        $password = $b['password'] ?? '';

        if (!$email || !$password)
            jsonError('email and password are required');

        $stmt = db()->prepare('SELECT * FROM users WHERE email = ? AND is_active = TRUE');
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        if (!$user || !password_verify($password, $user['password_hash']))
            jsonError('Invalid email or password', 401);

        $token = signToken($user);
        jsonOut([
            'token' => $token,
            'user'  => [
                'id'       => $user['id'],
                'name'     => $user['name'],
                'email'    => $user['email'],
                'role'     => $user['role'],
                'schoolId' => $user['school_id'],
            ],
        ]);
    })(),

    // GET /auth/me
    $sub === '/me' && $method === 'GET' => (function() {
        $auth = requireAuth();
        $stmt = db()->prepare(
            'SELECT id, name, email, role, school_id FROM users WHERE id = ? AND is_active = TRUE'
        );
        $stmt->execute([$auth['sub']]);
        $u = $stmt->fetch();
        if (!$u) jsonError('User not found', 401);
        jsonOut([
            'id'       => $u['id'],
            'name'     => $u['name'],
            'email'    => $u['email'],
            'role'     => $u['role'],
            'schoolId' => $u['school_id'],
        ]);
    })(),

    // PATCH /auth/password
    $sub === '/password' && $method === 'PATCH' => (function() {
        $auth = requireAuth();
        $b    = body();
        $cur  = $b['currentPassword'] ?? '';
        $new  = $b['newPassword']     ?? '';

        if (!$cur || !$new)
            jsonError('currentPassword and newPassword are required');
        if (strlen($new) < 8)
            jsonError('New password must be at least 8 characters');

        $stmt = db()->prepare('SELECT password_hash FROM users WHERE id = ?');
        $stmt->execute([$auth['sub']]);
        $row  = $stmt->fetch();
        if (!$row) jsonError('User not found', 404);

        if (!password_verify($cur, $row['password_hash']))
            jsonError('Current password is incorrect', 401);

        $hash = password_hash($new, PASSWORD_BCRYPT, ['cost' => 10]);
        db()->prepare('UPDATE users SET password_hash = ? WHERE id = ?')
            ->execute([$hash, $auth['sub']]);

        jsonOut(['success' => true]);
    })(),

    // POST /auth/create-user  (cerc_analyst seulement)
    $sub === '/create-user' && $method === 'POST' => (function() {
        $auth = requireRole('cerc_analyst');
        $b    = body();
        $validRoles = ['school_admin', 'cerc_analyst', 'monitor', 'public'];

        if (!in_array($b['role'] ?? '', $validRoles, true))
            jsonError('Invalid role');

        $hash = password_hash($b['password'] ?? 'ChangeMe123!', PASSWORD_BCRYPT, ['cost' => 10]);

        try {
            $stmt = db()->prepare(
                'INSERT INTO users (name, email, password_hash, role, school_id)
                 VALUES (?, ?, ?, ?, ?)
                 RETURNING id, name, email, role, school_id'
            );
            $stmt->execute([
                trim($b['name']  ?? ''),
                strtolower(trim($b['email'] ?? '')),
                $hash,
                $b['role'],
                $b['schoolId'] ?? null,
            ]);
            jsonOut($stmt->fetch(), 201);
        } catch (PDOException $e) {
            if (str_contains($e->getMessage(), '23505'))
                jsonError('Email already registered', 409);
            throw $e;
        }
    })(),

    // GET /auth/users  (cerc_analyst seulement)
    $sub === '/users' && $method === 'GET' => (function() {
        requireRole('cerc_analyst');
        $rows = db()->query(
            'SELECT u.id, u.name, u.email, u.role, u.school_id, u.is_active, u.created_at,
                    s.name AS school_name
             FROM users u LEFT JOIN schools s ON s.id = u.school_id
             ORDER BY u.created_at DESC'
        )->fetchAll();
        jsonOut($rows);
    })(),

    // PATCH /auth/users/:id  (cerc_analyst seulement)
    preg_match('#^/users/(\d+)$#', $sub, $um) > 0 && $method === 'PATCH' => (function() use ($um) {
        requireRole('cerc_analyst');
        $is_active = body()['is_active'] ?? null;
        $stmt = db()->prepare(
            'UPDATE users SET is_active=? WHERE id=? RETURNING id,name,email,role,is_active'
        );
        $stmt->execute([(bool)$is_active, (int)$um[1]]);
        $row = $stmt->fetch();
        if (!$row) jsonError('User not found', 404);
        jsonOut($row);
    })(),

    default => jsonError('Auth route not found', 404),
};
