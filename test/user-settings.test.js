import { describe, expect, it } from 'vitest';
import { handleChangePassword } from '../src/auth.js';
import { handleMemberStatus } from '../src/member.js';
import { hashPassword, generateSalt } from '../src/utils.js';

function request(body = {}, userId = 7) {
  return {
    session: { userId, username: 'alice', role: 'user' },
    json: async () => body,
  };
}

function createPasswordDb(currentPassword) {
  const state = { updatedHash: null };
  return {
    state,
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async first() {
              if (sql.includes('SELECT id, username, password_hash FROM users WHERE id = ?')) {
                const salt = generateSalt();
                const hash = await hashPassword(currentPassword, salt);
                return { id: params[0], username: 'alice', password_hash: salt + ':' + hash };
              }
              throw new Error('Unexpected first SQL: ' + sql);
            },
            async run() {
              if (sql.includes('UPDATE users SET password_hash = ?')) {
                state.updatedHash = params[0];
                return { meta: { changes: 1 } };
              }
              throw new Error('Unexpected run SQL: ' + sql);
            },
          };
        },
      };
    },
  };
}

function createMemberDb({ activated = false } = {}) {
  return {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async first() {
              if (sql.includes('SELECT * FROM memberships')) return { id: 1, user_id: params[0], start_date: '2026-01-01 00:00:00', expire_date: '2099-01-01 00:00:00' };
              if (sql.includes('SELECT id, username, email, emby_username, emby_user_id')) {
                return { id: params[0], username: 'alice', emby_username: activated ? 'alice_7_abcd' : null, emby_user_id: activated ? 'emby-7' : null };
              }
              if (sql.includes('SELECT value FROM config WHERE key = ?')) {
                if (params[0] === 'emby_server_lines') return { value: '主线路|https://emby.example.com\n备用线路|https://backup.example.com' };
                if (params[0] === 'emby_base_url') return { value: 'https://fallback.example.com' };
                return null;
              }
              throw new Error('Unexpected first SQL: ' + sql);
            },
            all() {
              if (sql.includes('SELECT * FROM memberships')) return { results: [] };
              throw new Error('Unexpected all SQL: ' + sql);
            },
          };
        },
      };
    },
  };
}

describe('user dashboard account settings', () => {
  it('allows a logged-in user to change membership-center login password', async () => {
    const env = { DB: createPasswordDb('old-pass-123') };

    const res = await handleChangePassword(request({ oldPassword: 'old-pass-123', newPassword: 'new-pass-456' }), env);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true });
    expect(env.DB.state.updatedHash).toMatch(/^pbkdf2:100000:[0-9a-f]{32}:[0-9a-f]+$/);
  });

  it('rejects password change when old password is wrong', async () => {
    const env = { DB: createPasswordDb('old-pass-123') };

    const res = await handleChangePassword(request({ oldPassword: 'wrong-pass', newPassword: 'new-pass-456' }), env);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe('auth_failed');
    expect(env.DB.state.updatedHash).toBeNull();
  });

  it('does not return server lines for users who have not activated an Emby account', async () => {
    const res = await handleMemberStatus(request({}, 7), { DB: createMemberDb({ activated: false }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.serverLines).toEqual([]);
  });

  it('always returns server lines for users who have activated an Emby account', async () => {
    const res = await handleMemberStatus(request({}, 7), { DB: createMemberDb({ activated: true }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.serverLines).toEqual([
      { name: '主线路', url: 'https://emby.example.com' },
      { name: '备用线路', url: 'https://backup.example.com' },
    ]);
  });
});
