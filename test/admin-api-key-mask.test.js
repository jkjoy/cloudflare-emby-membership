import { describe, expect, it } from 'vitest';
import { handleAdminGetConfig, handleAdminSetConfig } from '../src/admin.js';

function createConfigDb(initial) {
  const state = { values: { ...initial } };
  return {
    state,
    prepare(sql) {
      return {
        bind(...params) {
          return {
            all() {
              return { results: Object.entries(state.values).map(([key, value]) => ({ key, value })) };
            },
            run() {
              if (sql.includes('INSERT OR REPLACE INTO config')) {
                state.values[params[0]] = params[1];
                return { meta: { changes: 1 } };
              }
              throw new Error('Unexpected run SQL: ' + sql);
            },
          };
        },
        all() {
          return { results: Object.entries(state.values).map(([key, value]) => ({ key, value })) };
        },
      };
    },
  };
}

describe('admin API key masking', () => {
  it('masks Emby API key when returning admin config', async () => {
    const env = { DB: createConfigDb({ emby_api_key: 'super-secret-api-key', emby_base_url: 'https://emby.example.com' }) };

    const res = await handleAdminGetConfig(new Request('https://example.com/api/admin/config'), env);
    const body = await res.json();

    expect(body.config.emby_api_key).toBe('****************-key');
    expect(JSON.stringify(body)).not.toContain('super-secret-api-key');
  });

  it('does not overwrite existing API key when client posts masked value', async () => {
    const db = createConfigDb({ emby_api_key: 'super-secret-api-key', emby_base_url: 'https://emby.example.com' });
    const env = { DB: db };
    const req = new Request('https://example.com/api/admin/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emby_api_key: '****************-key', emby_base_url: 'https://emby.example.com' }),
    });

    const res = await handleAdminSetConfig(req, env);

    expect(res.status).toBe(200);
    expect(db.state.values.emby_api_key).toBe('super-secret-api-key');
  });
});
