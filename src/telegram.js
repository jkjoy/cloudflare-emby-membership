import { json } from './utils.js';
import { generateTelegramBindCode, consumeTelegramBindCode, getTelegramBindingByTelegramUser } from './telegramStorage.js';
import { getUserWithMembership, getCardByCode, useCard, addMembership, getUserById, getConfig } from './db.js';
import { parseServerLines, handleCreateEmbyAccount, handleResetEmbyPassword } from './emby.js';

function telegramApiUrl(env, method) {
  return `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`;
}

export async function sendTelegramMessage(env, chatId, text, runtime = globalThis, replyMarkup = null) {
  const body = { chat_id: chatId, text };
  if (replyMarkup) body.reply_markup = replyMarkup;
  return runtime.fetch(telegramApiUrl(env, 'sendMessage'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function answerCallback(env, callbackId, runtime = globalThis) {
  return runtime.fetch(telegramApiUrl(env, 'answerCallbackQuery'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackId }),
  });
}

function stateKey(chatId, userId) {
  return `telegram:state:${chatId}:${userId}`;
}

async function setState(env, chatId, userId, state) {
  if (env.SESSION_KV) await env.SESSION_KV.put(stateKey(chatId, userId), JSON.stringify(state), { expirationTtl: 600 });
}

async function getState(env, chatId, userId) {
  return env.SESSION_KV ? env.SESSION_KV.get(stateKey(chatId, userId), 'json') : null;
}

async function clearState(env, chatId, userId) {
  if (env.SESSION_KV) await env.SESSION_KV.delete(stateKey(chatId, userId));
}

export function mainMenuKeyboard(isBound = false) {
  if (!isBound) {
    return { inline_keyboard: [[{ text: '绑定账号', callback_data: 'bind' }]] };
  }
  return {
    inline_keyboard: [
      [{ text: '查询会员', callback_data: 'status' }, { text: '查询 Emby 账号', callback_data: 'emby_account' }],
      [{ text: '兑换卡密', callback_data: 'redeem' }, { text: '激活 Emby', callback_data: 'activate' }],
      [{ text: '查看线路', callback_data: 'lines' }, { text: '重置 Emby 密码', callback_data: 'reset_password' }],
    ],
  };
}

function bindGuideText() {
  return [
    '绑定步骤：',
    '1. 打开网页会员中心并登录账号。',
    '2. 在「绑定 Telegram 机器人」里点击「生成 Telegram 绑定码」。',
    '3. 把生成的 TG- 开头绑定码直接发送给我。',
    '',
    '绑定码 10 分钟有效，每个绑定码只能使用一次。',
  ].join('\n');
}

async function sendStatus(env, chatId, userId, runtime) {
  const data = await getUserWithMembership(env.DB, userId);
  const membership = data?.activeMembership;
  const text = membership
    ? `会员状态：✅ 已开通\n到期时间：${membership.expire_date}\n用户名：${data.username}`
    : '会员状态：❌ 未开通';
  await sendTelegramMessage(env, chatId, text, runtime, mainMenuKeyboard(true));
}

async function sendLines(env, chatId, userId, runtime) {
  const user = await getUserById(env.DB, userId);
  if (!user?.emby_user_id) {
    await sendTelegramMessage(env, chatId, '请先激活 Emby 账号后再查看线路。', runtime, mainMenuKeyboard(true));
    return;
  }
  const linesR = await getConfig(env.DB, 'emby_server_lines');
  const baseR = await getConfig(env.DB, 'emby_base_url');
  const lines = parseServerLines(linesR?.value || '', baseR?.value || '');
  const text = lines.length ? '服务器线路：\n' + lines.map(line => `${line.name}: ${line.url}`).join('\n') : '暂无服务器线路，请联系管理员。';
  await sendTelegramMessage(env, chatId, text, runtime, mainMenuKeyboard(true));
}

async function sendEmbyAccount(env, chatId, userId, runtime) {
  const user = await getUserById(env.DB, userId);
  if (!user?.emby_user_id) {
    await sendTelegramMessage(env, chatId, 'Emby 账号：未激活\n请点击「激活 Emby」生成账号。', runtime, mainMenuKeyboard(true));
    return;
  }
  const linesR = await getConfig(env.DB, 'emby_server_lines');
  const baseR = await getConfig(env.DB, 'emby_base_url');
  const lines = parseServerLines(linesR?.value || '', baseR?.value || '');
  const lineText = lines.length
    ? '\n服务器线路：\n' + lines.map(line => `${line.name}: ${line.url}`).join('\n')
    : '\n服务器线路：暂无，请联系管理员。';
  const text = [
    'Emby 账号：已激活',
    `用户名：${user.emby_username || user.username}`,
    `Emby ID：${user.emby_user_id}`,
    '密码：不会保存或回显；如需新密码，请点击「重置 Emby 密码」。',
    lineText,
  ].join('\n');
  await sendTelegramMessage(env, chatId, text, runtime, mainMenuKeyboard(true));
}

async function redeemCode(env, chatId, userId, code, runtime) {
  const card = await getCardByCode(env.DB, String(code).trim().toUpperCase());
  if (!card || card.status !== 'active') {
    await sendTelegramMessage(env, chatId, '卡密不存在、已使用或已禁用。', runtime, mainMenuKeyboard(true));
    return;
  }
  const used = await useCard(env.DB, card.id, userId);
  if (!used) {
    await sendTelegramMessage(env, chatId, '兑换失败，请稍后重试。', runtime, mainMenuKeyboard(true));
    return;
  }
  const result = await addMembership(env.DB, { userId, days: card.days, source: 'card_redeem', sourceId: card.id });
  await sendTelegramMessage(env, chatId, `兑换成功！会员有效期至 ${result.expire}`, runtime, mainMenuKeyboard(true));
}

async function resetEmbyPasswordForTelegram(env, chatId, userId, runtime) {
  const request = new Request('https://telegram.local/reset-emby-password', {
    headers: { 'CF-Connecting-IP': `telegram:${chatId}` },
  });
  request.session = { userId };
  const res = await handleResetEmbyPassword(request, env);
  const body = await res.json();
  return sendTelegramMessage(env, chatId, body.ok ? `新 Emby 密码：${body.data.password}\n仅本次显示，请立即保存。` : (body.message || '重置失败'), runtime, mainMenuKeyboard(true));
}

async function handleBoundCallback(callback, binding, env, runtime) {
  const chatId = callback.message.chat.id;
  await answerCallback(env, callback.id, runtime);
  if (callback.data === 'status') return sendStatus(env, chatId, binding.user_id, runtime);
  if (callback.data === 'emby_account') return sendEmbyAccount(env, chatId, binding.user_id, runtime);
  if (callback.data === 'lines') return sendLines(env, chatId, binding.user_id, runtime);
  if (callback.data === 'redeem') {
    await setState(env, chatId, callback.from.id, { action: 'redeem', userId: binding.user_id });
    return sendTelegramMessage(env, chatId, '请输入卡密，或发送 /cancel 取消。', runtime, { inline_keyboard: [[{ text: '取消', callback_data: 'cancel' }]] });
  }
  if (callback.data === 'cancel') {
    await clearState(env, chatId, callback.from.id);
    return sendTelegramMessage(env, chatId, '已取消。', runtime, mainMenuKeyboard(true));
  }
  if (callback.data === 'activate') {
    const res = await handleCreateEmbyAccount({ session: { userId: binding.user_id } }, env);
    const body = await res.json();
    if (!body.ok) return sendTelegramMessage(env, chatId, body.message || '激活失败', runtime, mainMenuKeyboard(true));
    const lines = (body.data.serverLines || []).map(line => `${line.name}: ${line.url}`).join('\n');
    return sendTelegramMessage(env, chatId, `Emby 账号创建成功，请立即保存：\n用户名：${body.data.username}\n密码：${body.data.password}\n${lines}`, runtime, mainMenuKeyboard(true));
  }
  if (callback.data === 'reset_password') {
    return resetEmbyPasswordForTelegram(env, chatId, binding.user_id, runtime);
  }
  return sendTelegramMessage(env, chatId, '请选择操作。', runtime, mainMenuKeyboard(true));
}

export async function handleTelegramWebhook(request, env, runtime = globalThis) {
  const expected = env.TELEGRAM_WEBHOOK_SECRET;
  const actual = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if (expected && actual !== expected) return json({ ok: false, error: 'invalid_secret' }, 401);

  const update = await request.json();
  const callback = update.callback_query;
  if (callback) {
    const chat = callback.message?.chat;
    if (!chat || chat.type !== 'private') {
      if (chat) await sendTelegramMessage(env, chat.id, '请在私聊中使用本机器人，避免泄露账号信息。', runtime);
      return json({ ok: true });
    }
    const binding = env.DB && callback.from ? await getTelegramBindingByTelegramUser(env.DB, callback.from.id) : null;
    if (!binding) {
      await answerCallback(env, callback.id, runtime);
      const text = callback.data === 'bind'
        ? bindGuideText()
        : '请先绑定账号：在网页会员中心生成 Telegram 绑定码，然后发送给我。';
      await sendTelegramMessage(env, chat.id, text, runtime, mainMenuKeyboard(false));
      return json({ ok: true });
    }
    await handleBoundCallback(callback, binding, env, runtime);
    return json({ ok: true });
  }

  const message = update.message;
  if (!message) return json({ ok: true });
  const chat = message.chat;
  if (!chat || chat.type !== 'private') {
    if (chat) await sendTelegramMessage(env, chat.id, '请在私聊中使用本机器人，避免泄露账号信息。', runtime);
    return json({ ok: true });
  }

  const text = (message.text || '').trim();
  if (text === '/cancel') {
    await clearState(env, chat.id, message.from.id);
    await sendTelegramMessage(env, chat.id, '已取消。', runtime, mainMenuKeyboard(!!(env.DB && message.from ? await getTelegramBindingByTelegramUser(env.DB, message.from.id) : null)));
    return json({ ok: true });
  }
  const pendingState = await getState(env, chat.id, message.from.id);
  if (pendingState?.action === 'redeem') {
    await clearState(env, chat.id, message.from.id);
    await redeemCode(env, chat.id, pendingState.userId, text, runtime);
    return json({ ok: true });
  }
  const existingBinding = env.DB && message.from ? await getTelegramBindingByTelegramUser(env.DB, message.from.id) : null;

  if (text === '/start') {
    await sendTelegramMessage(
      env,
      chat.id,
      existingBinding ? '欢迎回来，请选择操作。' : '欢迎使用 Emby 会员机器人，请先绑定账号。',
      runtime,
      mainMenuKeyboard(!!existingBinding)
    );
    return json({ ok: true });
  }

  if (/^TG-[A-Z0-9]{6}$/i.test(text) && env.DB && message.from) {
    const binding = await consumeTelegramBindCode(env.DB, text, message.from, chat.id);
    if (binding) {
      await sendTelegramMessage(env, chat.id, '绑定成功，现在可以使用会员自助功能。', runtime, mainMenuKeyboard(true));
      return json({ ok: true });
    }
  }

  if (!existingBinding) {
    await sendTelegramMessage(env, chat.id, '请先绑定账号：在网页会员中心生成 Telegram 绑定码，然后发送给我。', runtime, mainMenuKeyboard(false));
    return json({ ok: true });
  }

  if (/^(忘记密码|重置密码|重置Emby密码|重置 Emby 密码|reset)$/i.test(text)) {
    await resetEmbyPasswordForTelegram(env, chat.id, existingBinding.user_id, runtime);
    return json({ ok: true });
  }

  await sendTelegramMessage(env, chat.id, '请点击菜单操作，或发送 /start。', runtime, mainMenuKeyboard(true));
  return json({ ok: true });
}

export async function handleCreateTelegramBindCode(request, env) {
  const userId = request.session?.userId;
  if (!userId) return json({ error: 'unauthorized', message: '请先登录' }, 401);
  const code = await generateTelegramBindCode(env.DB, userId);
  return json({ ok: true, code, expiresIn: 600 });
}
