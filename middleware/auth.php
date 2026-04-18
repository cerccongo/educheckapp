<?php
// ══════════════════════════════════════════════
//  EduCheck v2 — middleware/auth.php
//  JWT pur PHP (sans bibliothèque externe)
// ══════════════════════════════════════════════

// ── Génération du token JWT ─────────────────────────────────────────────────
function signToken(array $user): string {
    $header  = base64url_encode(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
    $payload = base64url_encode(json_encode([
        'sub'      => $user['id'],
        'name'     => $user['name'],
        'email'    => $user['email'],
        'role'     => $user['role'],
        'schoolId' => $user['school_id'] ?? null,
        'iat'      => time(),
        'exp'      => time() + JWT_EXPIRES,
    ]));
    $sig = base64url_encode(hash_hmac('sha256', "$header.$payload", JWT_SECRET, true));
    return "$header.$payload.$sig";
}

// ── Vérification du token JWT ───────────────────────────────────────────────
function verifyToken(string $token): ?array {
    $parts = explode('.', $token);
    if (count($parts) !== 3) return null;
    [$header, $payload, $sig] = $parts;

    $expected = base64url_encode(hash_hmac('sha256', "$header.$payload", JWT_SECRET, true));
    if (!hash_equals($expected, $sig)) return null;

    $data = json_decode(base64url_decode($payload), true);
    if (!$data || (isset($data['exp']) && $data['exp'] < time())) return null;

    return $data;
}

// ── Lecture du Bearer token depuis Authorization ────────────────────────────
function getBearerToken(): ?string {
    $auth = $_SERVER['HTTP_AUTHORIZATION']
         ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION']
         ?? apache_request_headers()['Authorization']
         ?? '';
    if (preg_match('/^Bearer\s+(.+)$/i', $auth, $m)) return $m[1];
    return null;
}

// ── Middleware : attache req.user si token présent ──────────────────────────
function attachUser(): ?array {
    $token = getBearerToken();
    if (!$token) return null;
    $payload = verifyToken($token);
    return $payload ?: null;
}

// ── Middleware : exige auth ─────────────────────────────────────────────────
function requireAuth(): array {
    $user = attachUser();
    if (!$user) jsonError('Unauthorized — token missing or invalid', 401);
    return $user;
}

// ── Middleware : exige un rôle parmi ceux fournis ───────────────────────────
function requireRole(string ...$roles): array {
    $user = requireAuth();
    if (!in_array($user['role'], $roles, true))
        jsonError('Forbidden — insufficient role', 403);
    return $user;
}

// ── Helpers Base64url (RFC 4648 §5) ─────────────────────────────────────────
function base64url_encode(string $data): string {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function base64url_decode(string $data): string {
    return base64_decode(strtr($data, '-_', '+/') . str_repeat('=', 3 - (3 + strlen($data)) % 4));
}
