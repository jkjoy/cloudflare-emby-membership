import { describe, expect, it } from 'vitest';
import { getCards, getUsersAdmin } from '../src/db.js';

function createAsyncAllDb(rows) {
  return {
    prepare() {
      return {
        bind() {
          return {
            async all() {
              return { results: rows };
            },
          };
        },
      };
    },
  };
}

describe('admin async D1 list queries', () => {
  it('awaits D1 all() when reading cards', async () => {
    const rows = [{ id: 1, code: 'EMBY-ABC', days: 30, status: 'active', created_at: '2026-01-01 00:00:00' }];

    const result = await getCards(createAsyncAllDb(rows), { limit: 50, offset: 0 });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({ code: 'EMBY-ABC', createdAt: '2026-01-01 00:00:00' });
  });

  it('awaits D1 all() when reading admin users', async () => {
    const rows = [{ id: 1, username: 'alice', emby_username: 'alice_emby', emby_user_id: 'emby-1' }];

    const result = await getUsersAdmin(createAsyncAllDb(rows), { limit: 50, offset: 0 });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({ username: 'alice', embyBind: 'alice_emby', isEmbyBound: true });
  });
});
