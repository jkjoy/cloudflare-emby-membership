import { describe, expect, it } from 'vitest';
import { generateTelegramBindCode } from '../src/telegramStorage.js';
import { handleTelegramWebhook } from '../src/telegram.js';

function createDb() {
  const state = { bindCodes: [], bindings: [] };
  return {
    state,
    prepare(sql) {
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
                state.bindings.push({ user_id: params[0], telegram_user_id: String(params[1]), telegram_username: params[2], telegram_chat_id: String(params[3]) });
                return { meta: { changes: 1 } };
              }
              throw new Error('Unexpected run SQL: ' + sql);
            },
            async first() {
              if (sql.includes('FROM telegram_bind_codes')) {
                return state.bindCodes.find(c => c.code === params[0] && !c.used_at) || null;
              }
              if (sql.includes('FROM telegram_bindings')) {
                return state.bindings.find(b => b.telegram_user_id === String(params[0])) || null;
              }
              throw new Error('Unexpected first SQL: ' + sql);
            },
          };
        },
      };
    },
  };
}

function req(text) {
  return new Request('https://example.com/api/telegram/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'secret' },
    body: JSON.stringify({ update_id: 1, message: { text, chat: { id: 123, type: 'private' }, from: { id: 123, username: 'sun' } } }),
  });
}

function runtime() {
  const calls = [];
  return { calls, async fetch(url, init) { calls.push({ url: String(url), body: JSON.parse(init.body) }); return new Response('{"ok":true}'); } };
}

describe('Telegram account binding flow', () => {
  it('binds a Telegram user when they send a valid web bind code', async () => {
    const db = createDb();
    const code = await generateTelegramBindCode(db, 42);
    const rt = runtime();

    const res = await handleTelegramWebhook(req(code), { DB: db, TELEGRAM_WEBHOOK_SECRET: 'secret', TELEGRAM_BOT_TOKEN: 'token' }, rt);

    expect(res.status).toBe(200);
    expect(db.state.bindings[0]).toMatchObject({ user_id: 42, telegram_user_id: '123' });
    expect(rt.calls[0].body.text).toContain('绑定成功');
    expect(rt.calls[0].body.reply_markup.inline_keyboard.flat().map(b => b.callback_data)).toContain('status');
  });

  it('asks unbound users to bind first for normal text', async () => {
    const db = createDb();
    const rt = runtime();

    await handleTelegramWebhook(req('hello'), { DB: db, TELEGRAM_WEBHOOK_SECRET: 'secret', TELEGRAM_BOT_TOKEN: 'token' }, rt);

    expect(rt.calls[0].body.text).toContain('请先绑定账号');
  });
});
