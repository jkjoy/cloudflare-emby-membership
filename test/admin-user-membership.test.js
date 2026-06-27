import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { getUsersAdmin } from '../src/db.js';

function createDb(rows) {
  return {
    state: { sql: '' },
    prepare(sql) {
      this.state.sql = sql;
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

describe('admin user membership status', () => {
  it('returns normalized membership status fields for user list', async () => {
    const db = createDb([
      { id: 1, username: 'vip', active_membership_expire_date: '2099-01-01 00:00:00' },
      { id: 2, username: 'plain', active_membership_expire_date: null },
    ]);

    const result = await getUsersAdmin(db, { limit: 50, offset: 0 });

    expect(db.state.sql).toContain('active_membership_expire_date');
    expect(db.state.sql).toContain('LEFT JOIN memberships');
    expect(result.results[0]).toMatchObject({ isMember: true, activeMembership: { expireDate: '2099-01-01 00:00:00' } });
    expect(result.results[1]).toMatchObject({ isMember: false, activeMembership: null });
  });

  it('admin UI reads normalized isMember field for membership badge', () => {
    const html = readFileSync('./frontend/admin.html', 'utf-8');

    expect(html).toContain('u.isMember || u.activeMembership');
  });
});
