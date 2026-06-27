import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleCreateEmbyAccount } from '../src/emby.js';

function createEnv({ activeMembership = true, bound = false } = {}) {
  const state = {
    updated: null,
    config: {
      emby_base_url: 'https://emby.example.com',
      emby_api_key: 'test-api-key',
      emby_server_lines: '主线路|https://emby.example.com\n备用线路|https://backup.example.com',
    },
  };

  const DB = {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async first() {
              if (sql.includes('SELECT value FROM config WHERE key = ?')) {
                const value = state.config[params[0]];
                return value ? { value } : null;
              }
              if (sql.includes('SELECT * FROM memberships')) {
                return activeMembership ? { id: 1, user_id: params[0], expire_date: '2099-01-01 00:00:00' } : null;
              }
              if (sql.includes('SELECT id, username')) {
                return {
                  id: params[0],
                  username: 'siteuser',
                  emby_username: bound ? 'existing' : null,
                  emby_user_id: bound ? 'emby-existing' : null,
                };
              }
              throw new Error('Unexpected first SQL: ' + sql);
            },
            async run() {
              if (sql.includes('UPDATE users SET emby_username = ?, emby_user_id = ? WHERE id = ?')) {
                state.updated = { embyUsername: params[0], embyUserId: params[1], userId: params[2] };
                return { meta: { changes: 1 } };
              }
              throw new Error('Unexpected run SQL: ' + sql);
            },
          };
        },
      };
    },
  };
  return { DB, state };
}

function createRequest(body = {}) {
  return {
    method: 'POST',
    session: { userId: 7 },
    json: async () => body,
  };
}

describe('Emby account activation', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      if (url === 'https://emby.example.com/emby/Users/New') {
        const body = JSON.parse(options.body);
        expect(body.Name).toMatch(/^siteuser_7_[a-z0-9]{4}$/);
        return new Response(JSON.stringify({ Id: 'emby-user-7' }), { status: 200 });
      }
      if (url === 'https://emby.example.com/emby/Users/emby-user-7/Password') {
        const body = JSON.parse(options.body);
        expect(body.Id).toBe('emby-user-7');
        expect(body.CurrentPw).toBe('');
        expect(body.NewPw).toMatch(/^[A-Za-z0-9]{12}$/);
        return new Response('{}', { status: 200 });
      }
      if (url === 'https://emby.example.com/emby/Users/emby-user-7/Policy') {
        expect(JSON.parse(options.body)).toEqual({ IsDisabled: false });
        return new Response('{}', { status: 200 });
      }
      throw new Error('Unexpected fetch: ' + url);
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    globalThis.fetch = originalFetch;
  });

  it('clicking activation can create and bind an Emby account without user-supplied credentials, then return password and server lines', async () => {
    const env = createEnv();

    const res = await handleCreateEmbyAccount(createRequest({}), env);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.username).toMatch(/^siteuser_7_[a-z0-9]{4}$/);
    expect(body.data.password).toMatch(/^[A-Za-z0-9]{12}$/);
    expect(body.data.serverLines).toEqual([
      { name: '主线路', url: 'https://emby.example.com' },
      { name: '备用线路', url: 'https://backup.example.com' },
    ]);
    expect(env.state.updated).toEqual({
      embyUsername: body.data.username,
      embyUserId: 'emby-user-7',
      userId: 7,
    });
  });

  it('still requires an active membership before activation', async () => {
    const env = createEnv({ activeMembership: false });

    const res = await handleCreateEmbyAccount(createRequest({}), env);
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe('no_membership');
    expect(fetch).not.toHaveBeenCalled();
  });
});
