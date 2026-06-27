import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { getUsersAdmin } from '../src/db.js';

describe('admin user Emby binding status', () => {
  it('returns normalized Emby binding fields for admin user list', async () => {
    const db = {
      prepare(sql) {
        expect(sql).toContain('emby_user_id');
        return {
          bind() {
            return {
              all() {
                return {
                  results: [
                    { id: 1, username: 'bound', emby_username: 'bound_emby', emby_user_id: 'emby-1' },
                    { id: 2, username: 'plain', emby_username: null, emby_user_id: null },
                  ],
                };
              },
            };
          },
        };
      },
    };

    const result = await getUsersAdmin(db, { limit: 50, offset: 0 });

    expect(result.results[0]).toMatchObject({
      embyUsername: 'bound_emby',
      embyUserId: 'emby-1',
      embyBind: 'bound_emby',
      isEmbyBound: true,
    });
    expect(result.results[1]).toMatchObject({
      embyBind: '',
      isEmbyBound: false,
    });
  });

  it('admin UI reads real Emby binding fields instead of missing aliases', () => {
    const html = readFileSync('./frontend/admin.html', 'utf-8') + readFileSync('./frontend/assets/admin.js', 'utf-8');

    expect(html).toContain('u.embyBind || u.emby_username || u.emby_user_id');
    expect(html).not.toContain('u.embyId || u.embyBind');
  });
});
