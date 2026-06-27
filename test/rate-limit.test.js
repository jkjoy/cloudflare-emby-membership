import { describe, expect, it } from 'vitest';
import { checkRateLimit, rateLimitKeyFromRequest } from '../src/rateLimit.js';

function createKv() {
  const store = new Map();
  return {
    async get(key, type) {
      const value = store.get(key);
      if (!value) return null;
      return type === 'json' ? JSON.parse(value) : value;
    },
    async put(key, value) {
      store.set(key, value);
    },
  };
}

describe('rate limiting', () => {
  it('builds a key from CF-Connecting-IP and action scope', () => {
    const req = new Request('https://example.com/api/auth/login', { headers: { 'CF-Connecting-IP': '1.2.3.4' } });

    expect(rateLimitKeyFromRequest(req, 'login', 'alice')).toBe('rate:login:1.2.3.4:alice');
  });

  it('blocks after configured attempts inside the window', async () => {
    const kv = createKv();

    expect(await checkRateLimit(kv, 'rate:test', { limit: 2, ttl: 60 })).toMatchObject({ ok: true });
    expect(await checkRateLimit(kv, 'rate:test', { limit: 2, ttl: 60 })).toMatchObject({ ok: true });
    expect(await checkRateLimit(kv, 'rate:test', { limit: 2, ttl: 60 })).toMatchObject({ ok: false, retryAfter: 60 });
  });
});
