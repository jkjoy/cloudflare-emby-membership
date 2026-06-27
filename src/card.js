// src/card.js — 卡密生成/兑换/管理
import { json, parseBody, generateCode } from './utils.js';
import { getCardByCode, useCard, addMembership, createCard, getCards } from './db.js';
import { enforceRateLimit } from './rateLimit.js';

// 用户兑换卡密
export async function handleRedeem(request, env) {
  const { code } = await parseBody(request);
  if (!code || typeof code !== 'string') {
    return json({ error: 'invalid_input', message: '请输入卡密' }, 400);
  }
  const limited = await enforceRateLimit(env, request, 'redeem', request.session.userId, { limit: 10, ttl: 600 });
  if (limited) return limited;

  const card = await getCardByCode(env.DB, code.trim().toUpperCase());
  if (!card) {
    return json({ error: 'not_found', message: '卡密不存在' }, 404);
  }
  if (card.status !== 'active') {
    return json({ error: 'used', message: '卡密已使用或已禁用' }, 400);
  }

  const userId = request.session.userId;
  const cardUsed = await useCard(env.DB, card.id, userId);
  if (!cardUsed) {
    return json({ error: 'failed', message: '兑换失败，请重试' }, 500);
  }

  const result = await addMembership(env.DB, {
    userId,
    days: card.days,
    source: 'card_redeem',
    sourceId: card.id,
  });

  if (!result) {
    return json({ error: 'db_error', message: '会员添加失败' }, 500);
  }

  return json({
    ok: true,
    message: `兑换成功！会员有效期至 ${result.expire}`,
    expireDate: result.expire,
  });
}

// 管理员生成卡密
export async function handleGenerateCard(request, env) {
  const { days, count = 1 } = await parseBody(request);
  if (!days || days < 1 || days > 36500) {
    return json({ error: 'invalid_input', message: '天数必须在 1-36500 之间' }, 400);
  }
  if (count < 1 || count > 1000) {
    return json({ error: 'invalid_input', message: '批量数量必须在 1-1000 之间' }, 400);
  }

  const adminId = request.session.userId;
  const batchId = `batch-${Date.now()}-${adminId}`;
  const cards = [];

  for (let i = 0; i < count; i++) {
    const code = generateCode();
    const success = await createCard(env.DB, { code, days, createdBy: adminId, batchId });
    if (success) cards.push(code);
  }

  return json({ ok: true, count: cards.length, batchId, cards });
}

// 管理员查看卡密列表
export async function handleCardList(request, env) {
  const url = new URL(request.url);
  const status = url.searchParams.get('status') || null;
  const limit = parseInt(url.searchParams.get('limit')) || 50;
  const offset = parseInt(url.searchParams.get('offset')) || 0;

  const result = await getCards(env.DB, { status, limit, offset });
  return json({ ok: true, cards: result.results });
}

// 管理员禁用卡密
export async function handleDisableCard(request, env) {
  const { id } = await parseBody(request);
  if (!id) return json({ error: 'invalid_input' }, 400);
  await env.DB.prepare("UPDATE activation_codes SET status = 'disabled' WHERE id = ? AND status = 'active'").bind(id).run();
  return json({ ok: true });
}