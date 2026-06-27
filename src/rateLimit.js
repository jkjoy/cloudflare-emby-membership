export function rateLimitKeyFromRequest(request, action, scope = '') {
  const ip = request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'unknown';
  return ['rate', action, ip, scope].filter(Boolean).join(':');
}

export async function checkRateLimit(kv, key, { limit, ttl }) {
  const current = await kv.get(key, 'json');
  const count = current?.count || 0;
  if (count >= limit) {
    return { ok: false, retryAfter: ttl };
  }
  await kv.put(key, JSON.stringify({ count: count + 1 }), { expirationTtl: ttl });
  return { ok: true, remaining: Math.max(0, limit - count - 1) };
}

export async function enforceRateLimit(env, request, action, scope, options) {
  if (!env.SESSION_KV) return null;
  const result = await checkRateLimit(env.SESSION_KV, rateLimitKeyFromRequest(request, action, scope), options);
  if (!result.ok) {
    return new Response(JSON.stringify({ error: 'rate_limited', message: '请求过于频繁，请稍后再试', retryAfter: result.retryAfter }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': String(result.retryAfter) },
    });
  }
  return null;
}
