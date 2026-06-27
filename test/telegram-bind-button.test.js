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

function createDb() {
  return {
    prepare(sql) {
      return {
        bind() {
          return {
            async first() {
              if (sql.includes('FROM telegram_bindings')) return null;
              throw new Error('Unexpected first SQL: ' + sql);
            },
          };
        },
      };
    },
  };
}

describe('Telegram bind button', () => {
  it('shows a dedicated web bind-code guide when an unbound user taps bind', async () => {
    const runtime = createRuntime();
    const res = await handleTelegramWebhook(req({
      update_id: 1,
      callback_query: {
        id: 'cb1',
        data: 'bind',
        from: { id: 123, username: 'sun' },
        message: { chat: { id: 123, type: 'private' } },
      },
    }), { DB: createDb(), TELEGRAM_WEBHOOK_SECRET: 'secret', TELEGRAM_BOT_TOKEN: 'token' }, runtime);

    expect(res.status).toBe(200);
    const sendMessageCall = runtime.calls.find(call => call.url.includes('/sendMessage'));
    expect(sendMessageCall.body.text).toContain('绑定步骤');
    expect(sendMessageCall.body.text).toContain('会员中心');
    expect(sendMessageCall.body.text).toContain('TG-');
  });
});
