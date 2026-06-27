import { describe, expect, it } from 'vitest';
import { handleTelegramWebhook } from '../src/telegram.js';

function createKv() {
  const store = new Map();
  return {
    async get(k, type) { const v = store.get(k); return type === 'json' && v ? JSON.parse(v) : v || null; },
    async put(k, v) { store.set(k, v); },
    async delete(k) { store.delete(k); },
  };
}

function createDb() {
  const state = {
    bindings: [{ user_id: 42, telegram_user_id: '123', telegram_chat_id: '123' }],
    users: [{ id: 42, username: 'sun', emby_user_id: 'emby-1', emby_username: 'sun_emby' }],
    memberships: [{ user_id: 42, expire_date: '2099-01-01 00:00:00', start_date: '2026-01-01 00:00:00', days_added: 30, source: 'card_redeem' }],
    cards: [{ id: 9, code: 'EMBY-OK', days: 30, status: 'active' }],
    config: { emby_server_lines: '主线路|https://emby.example.com', emby_base_url: 'https://emby.example.com' },
  };
  return {
    state,
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async first() {
              if (sql.includes('FROM telegram_bindings')) return state.bindings.find(b => b.telegram_user_id === String(params[0])) || null;
              if (sql.includes('FROM users WHERE id')) return state.users.find(u => u.id === params[0]) || null;
              if (sql.includes('FROM memberships WHERE user_id')) return state.memberships.find(m => m.user_id === params[0]) || null;
              if (sql.includes('FROM activation_codes')) return state.cards.find(c => c.code === params[0]) || null;
              if (sql.includes('FROM config')) return state.config[params[0]] ? { value: state.config[params[0]] } : null;
              return null;
            },
            async all() {
              if (sql.includes('FROM memberships')) return { results: state.memberships.filter(m => m.user_id === params[0]) };
              return { results: [] };
            },
            async run() {
              if (sql.includes('UPDATE activation_codes')) {
                const card = state.cards.find(c => c.id === params[2] && c.status === 'active');
                if (card) { card.status = 'used'; card.used_by = params[1]; }
                return { meta: { changes: card ? 1 : 0 } };
              }
              if (sql.includes('INSERT INTO memberships')) {
                state.memberships.push({ user_id: params[0], days_added: params[1], start_date: params[2], expire_date: params[3], source: params[4], source_id: params[5] });
                return { meta: { changes: 1 } };
              }
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
}

function callback(data) {
  return new Request('https://example.com/api/telegram/webhook', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'secret' },
    body: JSON.stringify({ update_id: 1, callback_query: { id: 'cb1', data, from: { id: 123, username: 'sun' }, message: { chat: { id: 123, type: 'private' } } } }),
  });
}

function message(text) {
  return new Request('https://example.com/api/telegram/webhook', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'secret' },
    body: JSON.stringify({ update_id: 2, message: { text, chat: { id: 123, type: 'private' }, from: { id: 123, username: 'sun' } } }),
  });
}

function runtime() {
  const calls = [];
  return { calls, async fetch(url, init) { calls.push({ url: String(url), body: JSON.parse(init.body) }); return new Response('{"ok":true}'); } };
}

describe('Telegram user flows', () => {
  it('shows membership status for a bound user', async () => {
    const rt = runtime();
    await handleTelegramWebhook(callback('status'), { DB: createDb(), SESSION_KV: createKv(), TELEGRAM_WEBHOOK_SECRET: 'secret', TELEGRAM_BOT_TOKEN: 'token' }, rt);

    expect(rt.calls.some(c => c.url.includes('answerCallbackQuery'))).toBe(true);
    const msg = rt.calls.find(c => c.url.includes('sendMessage'));
    expect(msg.body.text).toContain('会员状态');
    expect(msg.body.text).toContain('2099-01-01');
  });

  it('redeems an activation code through a button-driven flow', async () => {
    const db = createDb();
    const kv = createKv();
    const rt = runtime();

    await handleTelegramWebhook(callback('redeem'), { DB: db, SESSION_KV: kv, TELEGRAM_WEBHOOK_SECRET: 'secret', TELEGRAM_BOT_TOKEN: 'token' }, rt);
    await handleTelegramWebhook(message('EMBY-OK'), { DB: db, SESSION_KV: kv, TELEGRAM_WEBHOOK_SECRET: 'secret', TELEGRAM_BOT_TOKEN: 'token' }, rt);

    const texts = rt.calls.filter(c => c.url.includes('sendMessage')).map(c => c.body.text).join('\n');
    expect(texts).toContain('请输入卡密');
    expect(texts).toContain('兑换成功');
    expect(db.state.cards[0].status).toBe('used');
  });
});
