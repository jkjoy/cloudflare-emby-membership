import { describe, expect, it } from 'vitest';
import { handleTelegramWebhook } from '../src/telegram.js';

function req(update, secret = 'secret') {
  return new Request('https://example.com/api/telegram/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': secret },
    body: JSON.stringify(update),
  });
}

function createRuntime() {
  const calls = [];
  return {
    calls,
    async fetch(url, init) {
      calls.push({ url: String(url), body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ ok: true, result: {} }), { headers: { 'Content-Type': 'application/json' } });
    },
  };
}

describe('Telegram webhook', () => {
  it('rejects invalid Telegram webhook secret', async () => {
    const runtime = createRuntime();
    const res = await handleTelegramWebhook(req({ update_id: 1 }, 'wrong'), { TELEGRAM_WEBHOOK_SECRET: 'secret', TELEGRAM_BOT_TOKEN: 'token' }, runtime);

    expect(res.status).toBe(401);
    expect(runtime.calls).toHaveLength(0);
  });

  it('rejects non-private chats', async () => {
    const runtime = createRuntime();
    const res = await handleTelegramWebhook(req({
      update_id: 1,
      message: { text: '/start', chat: { id: -100, type: 'group' }, from: { id: 123, username: 'sun' } },
    }), { TELEGRAM_WEBHOOK_SECRET: 'secret', TELEGRAM_BOT_TOKEN: 'token' }, runtime);

    expect(res.status).toBe(200);
    expect(runtime.calls[0].body.chat_id).toBe(-100);
    expect(runtime.calls[0].body.text).toContain('请在私聊中使用');
  });

  it('responds to /start with private-chat menu buttons', async () => {
    const runtime = createRuntime();
    const res = await handleTelegramWebhook(req({
      update_id: 1,
      message: { text: '/start', chat: { id: 123, type: 'private' }, from: { id: 123, username: 'sun' } },
    }), { TELEGRAM_WEBHOOK_SECRET: 'secret', TELEGRAM_BOT_TOKEN: 'token' }, runtime);

    expect(res.status).toBe(200);
    expect(runtime.calls[0].url).toContain('/bottoken/sendMessage');
    expect(runtime.calls[0].body.text).toContain('Emby 会员机器人');
    expect(runtime.calls[0].body.reply_markup.inline_keyboard[0][0]).toMatchObject({ text: '绑定账号', callback_data: 'bind' });
  });
});
