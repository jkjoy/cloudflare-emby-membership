import { afterEach, describe, expect, it, vi } from 'vitest';
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
    points: [{ user_id: 42, balance: 120, total_earned: 120, total_spent: 0 }],
    checkins: [],
    inviteCodes: [{ user_id: 42, invite_code: 'INVITE42' }],
    pointTx: [],
    config: { emby_server_lines: '主线路|https://emby.example.com', emby_base_url: 'https://emby.example.com', emby_api_key: 'test-api-key' },
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
              if (sql.includes('FROM user_points')) return state.points.find(p => p.user_id === params[0]) || null;
              if (sql.includes('FROM daily_checkins')) return state.checkins.find(c => c.user_id === params[0] && c.checkin_date === params[1]) || null;
              if (sql.includes('FROM user_invite_codes')) return state.inviteCodes.find(c => c.user_id === params[0] || c.invite_code === params[0]) || null;
              if (sql.includes('FROM invites')) return null;
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
              if (sql.includes('INSERT OR IGNORE INTO user_points')) {
                if (!state.points.find(p => p.user_id === params[0])) state.points.push({ user_id: params[0], balance: 0, total_earned: 0, total_spent: 0 });
                return { meta: { changes: 1 } };
              }
              if (sql.includes('UPDATE user_points SET balance = balance +')) {
                const p = state.points.find(row => row.user_id === params[2]);
                p.balance += params[0]; p.total_earned += params[1];
                return { meta: { changes: 1 } };
              }
              if (sql.includes('UPDATE user_points SET balance = balance -')) {
                const p = state.points.find(row => row.user_id === params[2]);
                if (p.balance < params[3]) return { meta: { changes: 0 } };
                p.balance -= params[0]; p.total_spent += params[1];
                return { meta: { changes: 1 } };
              }
              if (sql.includes('INSERT INTO point_transactions')) {
                state.pointTx.push({ user_id: params[0], points: params[1], type: params[2] });
                return { meta: { changes: 1 } };
              }
              if (sql.includes('INSERT INTO daily_checkins')) {
                state.checkins.push({ user_id: params[0], checkin_date: params[1], points: params[2] });
                return { meta: { changes: 1 } };
              }
              if (sql.includes('INSERT INTO user_invite_codes')) {
                state.inviteCodes.push({ user_id: params[0], invite_code: params[1] });
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
  afterEach(() => vi.unstubAllGlobals());

  it('shows membership status for a bound user', async () => {
    const rt = runtime();
    await handleTelegramWebhook(callback('status'), { DB: createDb(), SESSION_KV: createKv(), TELEGRAM_WEBHOOK_SECRET: 'secret', TELEGRAM_BOT_TOKEN: 'token' }, rt);

    expect(rt.calls.some(c => c.url.includes('answerCallbackQuery'))).toBe(true);
    const msg = rt.calls.find(c => c.url.includes('sendMessage'));
    expect(msg.body.text).toContain('会员状态');
    expect(msg.body.text).toContain('2099-01-01');
  });

  it('shows Emby account info for a bound activated user', async () => {
    const rt = runtime();
    await handleTelegramWebhook(callback('emby_account'), { DB: createDb(), SESSION_KV: createKv(), TELEGRAM_WEBHOOK_SECRET: 'secret', TELEGRAM_BOT_TOKEN: 'token' }, rt);

    const msg = rt.calls.find(c => c.url.includes('sendMessage'));
    expect(msg.body.text).toContain('Emby 账号');
    expect(msg.body.text).toContain('sun_emby');
    expect(msg.body.text).toContain('已激活');
    expect(msg.body.text).toContain('主线路');
    expect(msg.body.text).toContain('如需新密码');
  });

  it('resets Emby password when a bound user sends forgot-password text', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      expect(url).toBe('https://emby.example.com/emby/Users/emby-1/Password');
      expect(options.method).toBe('POST');
      expect(options.headers['X-Emby-Token']).toBe('test-api-key');
      const body = JSON.parse(options.body);
      expect(body.Id).toBe('emby-1');
      expect(body.NewPw).toMatch(/^[A-Za-z0-9]{12}$/);
      return new Response('{}', { status: 200 });
    }));
    const rt = runtime();

    await handleTelegramWebhook(message('忘记密码'), { DB: createDb(), SESSION_KV: createKv(), TELEGRAM_WEBHOOK_SECRET: 'secret', TELEGRAM_BOT_TOKEN: 'token' }, rt);

    const msg = rt.calls.find(c => c.url.includes('sendMessage'));
    expect(msg.body.text).toContain('新 Emby 密码');
    expect(msg.body.text).toContain('仅本次显示');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('handles point checkin, point status, point exchange and invite link from Telegram menu', async () => {
    const db = createDb();
    const kv = createKv();
    const rt = runtime();

    await handleTelegramWebhook(callback('points_status'), { DB: db, SESSION_KV: kv, TELEGRAM_WEBHOOK_SECRET: 'secret', TELEGRAM_BOT_TOKEN: 'token' }, rt);
    await handleTelegramWebhook(callback('points_checkin'), { DB: db, SESSION_KV: kv, TELEGRAM_WEBHOOK_SECRET: 'secret', TELEGRAM_BOT_TOKEN: 'token' }, rt);
    await handleTelegramWebhook(callback('points_exchange'), { DB: db, SESSION_KV: kv, TELEGRAM_WEBHOOK_SECRET: 'secret', TELEGRAM_BOT_TOKEN: 'token' }, rt);
    await handleTelegramWebhook(callback('invite_link'), { DB: db, SESSION_KV: kv, TELEGRAM_WEBHOOK_SECRET: 'secret', TELEGRAM_BOT_TOKEN: 'token' }, rt);

    const texts = rt.calls.filter(c => c.url.includes('sendMessage')).map(c => c.body.text).join('\n');
    expect(texts).toContain('当前积分');
    expect(texts).toContain('签到成功');
    expect(texts).toContain('兑换成功');
    expect(texts).toContain('邀请链接');
    expect(texts).toContain('INVITE42');
    expect(db.state.memberships.some(m => m.source === 'points_exchange')).toBe(true);
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
