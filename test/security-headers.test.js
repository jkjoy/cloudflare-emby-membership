import { describe, expect, it } from 'vitest';
import { json } from '../src/utils.js';
import { handleLogin } from '../src/auth.js';
import { createPasswordHash } from '../src/utils.js';

function createEnv() {
  return {
    SESSION_KV: { async get() { return null; }, async put() {} },
    DB: {
      prepare(sql) {
        return {
          bind() {
            return {
              async first() {
                return { id: 1, username: 'alice', role: 'user', password_hash: await createPasswordHash('secret123') };
              },
              async run() { return { meta: { changes: 1 } }; },
            };
          },
        };
      },
    },
  };
}

describe('security headers', () => {
  it('adds security headers to JSON responses', () => {
    const res = json({ ok: true });

    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
  });

  it('sets Secure on session cookies', async () => {
    const req = new Request('https://example.com/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'alice', password: 'secret123' }),
    });

    const res = await handleLogin(req, createEnv());
    const cookie = res.headers.get('Set-Cookie');

    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
  });
});
