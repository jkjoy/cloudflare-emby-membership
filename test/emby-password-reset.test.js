import { describe, expect, it, vi, afterEach } from 'vitest';
import { handleResetEmbyPassword } from '../src/emby.js';

function request(userId = 7) {
  return {
    session: { userId, username: 'alice', role: 'user' },
    json: async () => ({}),
  };
}

function createDb({ activated = true } = {}) {
  return {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async first() {
              if (sql.includes('SELECT value FROM config WHERE key = ?')) {
                if (params[0] === 'emby_base_url') return { value: 'https://emby.example.com' };
                if (params[0] === 'emby_api_key') return { value: 'test-api-key' };
                if (params[0] === 'emby_server_lines') return { value: '主线路|https://emby.example.com' };
                return null;
              }
              if (sql.includes('SELECT * FROM memberships')) {
                return { id: 1, user_id: params[0], expire_date: '2099-01-01 00:00:00' };
              }
              if (sql.includes('SELECT id, username, email, emby_username, emby_user_id')) {
                return {
                  id: params[0],
                  username: 'alice',
                  emby_username: activated ? 'alice_7_abcd' : null,
                  emby_user_id: activated ? 'emby-7' : null,
                };
              }
              throw new Error('Unexpected first SQL: ' + sql);
            },
          };
        },
      };
    },
  };
}

describe('Emby password reset', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('resets password for activated user and returns generated password only in response', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      expect(url).toBe('https://emby.example.com/emby/Users/emby-7/Password');
      expect(options.method).toBe('POST');
      expect(options.headers['X-Emby-Token']).toBe('test-api-key');
      const body = JSON.parse(options.body);
      expect(body.Id).toBe('emby-7');
      expect(body.CurrentPw).toBe('');
      expect(body.NewPw).toMatch(/^[A-Za-z0-9]{12}$/);
      return new Response('{}', { status: 200 });
    }));

    const res = await handleResetEmbyPassword(request(), { DB: createDb({ activated: true }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.password).toMatch(/^[A-Za-z0-9]{12}$/);
    expect(body.message).toContain('仅本次显示');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects reset for user who has not activated Emby account', async () => {
    vi.stubGlobal('fetch', vi.fn());

    const res = await handleResetEmbyPassword(request(), { DB: createDb({ activated: false }) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe('not_activated');
    expect(fetch).not.toHaveBeenCalled();
  });
});
