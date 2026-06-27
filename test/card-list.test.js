import { describe, expect, it } from 'vitest';
import { getCards } from '../src/db.js';

function createDbWithSqlCapture() {
  const state = { sql: '', params: [] };
  return {
    state,
    prepare(sql) {
      state.sql = sql;
      return {
        bind(...params) {
          state.params = params;
          return {
            all() {
              return {
                results: [{
                  id: 1,
                  code: 'EMBY-TEST',
                  days: 30,
                  status: 'used',
                  used_by: 7,
                  used_by_username: 'alice',
                  used_at: '2026-06-27 10:00:00',
                  created_by: 1,
                  created_by_username: 'admin',
                  batch_id: 'batch-1',
                  created_at: '2026-06-27 09:00:00',
                }],
              };
            },
          };
        },
      };
    },
  };
}

describe('admin card list', () => {
  it('returns card creator, used user, and created time fields ready for admin UI', () => {
    const db = createDbWithSqlCapture();

    const result = getCards(db, { status: null, limit: 50, offset: 0 });

    expect(db.state.sql).toContain('LEFT JOIN users used_user');
    expect(db.state.sql).toContain('LEFT JOIN users created_user');
    expect(result.results[0]).toMatchObject({
      usedBy: 'alice',
      usedById: 7,
      createdBy: 'admin',
      createdById: 1,
      createdAt: '2026-06-27 09:00:00',
      usedAt: '2026-06-27 10:00:00',
    });
  });
});
