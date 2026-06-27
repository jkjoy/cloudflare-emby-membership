import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { generateTelegramBindCode, consumeTelegramBindCode, getTelegramBindingByTelegramUser, getTelegramBindingByUserId } from '../src/telegramStorage.js';
import { handleCreateTelegramBindCode, handleTelegramBindingStatus } from '../src/telegram.js';

function createDb() {
  const state = { bindCodes: [], bindings: [], sql: [] };
  return {
    state,
    prepare(sql) {
      state.sql.push(sql);
      return {
        bind(...params) {
          return {
            async run() {
              if (sql.includes('INSERT INTO telegram_bind_codes')) {
                state.bindCodes.push({ user_id: params[0], code: params[1], expires_at: params[2], used_at: null });
                return { meta: { changes: 1 } };
              }
              if (sql.includes('UPDATE telegram_bind_codes SET used_at')) {
                const row = state.bindCodes.find(c => c.code === params[0]);
                if (row) row.used_at = 'now';
                return { meta: { changes: row ? 1 : 0 } };
              }
              if (sql.includes('INSERT OR REPLACE INTO telegram_bindings')) {
                state.bindings = state.bindings.filter(b => b.user_id !== params[0] && b.telegram_user_id !== String(params[1]));
                state.bindings.push({ user_id: params[0], telegram_user_id: String(params[1]), telegram_username: params[2], telegram_chat_id: String(params[3]), updated_at: '2026-06-27 10:00:00' });
                return { meta: { changes: 1 } };
              }
              throw new Error('Unexpected run SQL: ' + sql);
            },
            async first() {
              if (sql.includes('FROM telegram_bind_codes')) {
                return state.bindCodes.find(c => c.code === params[0] && !c.used_at) || null;
              }
              if (sql.includes('FROM telegram_bindings WHERE telegram_user_id')) {
                return state.bindings.find(b => b.telegram_user_id === String(params[0])) || null;
              }
              if (sql.includes('FROM telegram_bindings WHERE user_id')) {
                return state.bindings.find(b => b.user_id === params[0]) || null;
              }
              throw new Error('Unexpected first SQL: ' + sql);
            },
          };
        },
      };
    },
  };
}

describe('Telegram binding storage', () => {
  it('migration creates Telegram binding and code tables', () => {
    const sql = readFileSync('./migrations/002_telegram_bot.sql', 'utf-8');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS telegram_bindings');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS telegram_bind_codes');
    expect(sql).toContain('telegram_user_id');
  });

  it('generates a one-time bind code for the logged-in web user', async () => {
    const env = { DB: createDb() };
    const request = { session: { userId: 42 } };

    const res = await handleCreateTelegramBindCode(request, env);
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.code).toMatch(/^TG-[A-Z0-9]{6}$/);
    expect(env.DB.state.bindCodes[0]).toMatchObject({ user_id: 42, code: body.code });
  });

  it('consumes a code and creates a Telegram binding', async () => {
    const db = createDb();
    const code = await generateTelegramBindCode(db, 7);

    const binding = await consumeTelegramBindCode(db, code, { id: 123456, username: 'sun' }, 123456);

    expect(binding).toMatchObject({ userId: 7, telegramUserId: '123456' });
    expect(await getTelegramBindingByTelegramUser(db, 123456)).toMatchObject({ user_id: 7, telegram_user_id: '123456' });
  });

  it('returns the current web user Telegram binding status', async () => {
    const db = createDb();
    const code = await generateTelegramBindCode(db, 7);
    await consumeTelegramBindCode(db, code, { id: 123456, username: 'sun' }, 123456);

    const binding = await getTelegramBindingByUserId(db, 7);
    expect(binding).toMatchObject({ user_id: 7, telegram_user_id: '123456', telegram_username: 'sun' });

    const res = await handleTelegramBindingStatus({ session: { userId: 7 } }, { DB: db });
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.bound).toBe(true);
    expect(body.binding).toMatchObject({ telegramUserId: '123456', telegramUsername: 'sun', boundAt: '2026-06-27 10:00:00' });
  });
});
