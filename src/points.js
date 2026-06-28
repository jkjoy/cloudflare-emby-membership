import { json, parseBody, generateCode } from './utils.js';
import { addMembership, getConfig, getActiveMembership } from './db.js';
import { enforceRateLimit } from './rateLimit.js';

export const POINT_CONFIG_DEFAULTS = {
  points_checkin_min: '1',
  points_checkin_max: '10',
  points_exchange_cost: '100',
  points_exchange_days: '30',
  points_invite_register: '20',
  points_invite_member: '50',
};

async function getNumberConfig(db, key) {
  const row = await getConfig(db, key);
  const raw = row?.value ?? POINT_CONFIG_DEFAULTS[key] ?? '0';
  const value = parseInt(raw, 10);
  return Number.isFinite(value) ? value : parseInt(POINT_CONFIG_DEFAULTS[key] || '0', 10);
}

export async function getPointConfig(db) {
  const out = {};
  for (const key of Object.keys(POINT_CONFIG_DEFAULTS)) out[key] = await getNumberConfig(db, key);
  if (out.points_checkin_min < 0) out.points_checkin_min = 0;
  if (out.points_checkin_max < out.points_checkin_min) out.points_checkin_max = out.points_checkin_min;
  if (out.points_exchange_cost < 1) out.points_exchange_cost = 1;
  if (out.points_exchange_days < 1) out.points_exchange_days = 1;
  if (out.points_invite_register < 0) out.points_invite_register = 0;
  if (out.points_invite_member < 0) out.points_invite_member = 0;
  return out;
}

function todayString(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function randomInt(min, max) {
  const low = Math.ceil(min);
  const high = Math.floor(max);
  if (high <= low) return low;
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return low + (bytes[0] % (high - low + 1));
}

export async function ensurePointAccount(db, userId) {
  await db.prepare('INSERT OR IGNORE INTO user_points (user_id, balance, total_earned, total_spent) VALUES (?, 0, 0, 0)')
    .bind(userId).run();
}

export async function getPointBalance(db, userId) {
  await ensurePointAccount(db, userId);
  return db.prepare('SELECT * FROM user_points WHERE user_id = ?').bind(userId).first();
}

export async function addPoints(db, userId, points, type, description = '', sourceId = '') {
  const amount = Math.max(0, parseInt(points, 10) || 0);
  if (amount <= 0) return null;
  await ensurePointAccount(db, userId);
  await db.prepare('UPDATE user_points SET balance = balance + ?, total_earned = total_earned + ?, updated_at = datetime(\'now\') WHERE user_id = ?')
    .bind(amount, amount, userId).run();
  await db.prepare('INSERT INTO point_transactions (user_id, points, type, source_id, description) VALUES (?, ?, ?, ?, ?)')
    .bind(userId, amount, type, String(sourceId || ''), description).run();
  return getPointBalance(db, userId);
}

export async function spendPoints(db, userId, points, type, description = '', sourceId = '') {
  const amount = Math.max(0, parseInt(points, 10) || 0);
  if (amount <= 0) return null;
  await ensurePointAccount(db, userId);
  const current = await getPointBalance(db, userId);
  if ((current?.balance || 0) < amount) return null;
  await db.prepare('UPDATE user_points SET balance = balance - ?, total_spent = total_spent + ?, updated_at = datetime(\'now\') WHERE user_id = ? AND balance >= ?')
    .bind(amount, amount, userId, amount).run();
  await db.prepare('INSERT INTO point_transactions (user_id, points, type, source_id, description) VALUES (?, ?, ?, ?, ?)')
    .bind(userId, -amount, type, String(sourceId || ''), description).run();
  return getPointBalance(db, userId);
}

export async function getOrCreateInviteCode(db, userId) {
  const existing = await db.prepare('SELECT invite_code FROM user_invite_codes WHERE user_id = ?').bind(userId).first();
  if (existing?.invite_code) return existing.invite_code;
  for (let i = 0; i < 5; i++) {
    const code = generateCode('').replace(/[^A-Z0-9]/g, '').slice(0, 8);
    try {
      await db.prepare('INSERT INTO user_invite_codes (user_id, invite_code) VALUES (?, ?)').bind(userId, code).run();
      return code;
    } catch {}
  }
  throw new Error('生成邀请码失败');
}

export async function createInviteIfValid(db, inviteCode, inviteeUserId) {
  if (!inviteCode) return null;
  const code = String(inviteCode).trim().toUpperCase();
  const row = await db.prepare('SELECT user_id, invite_code FROM user_invite_codes WHERE invite_code = ?').bind(code).first();
  if (!row || row.user_id === inviteeUserId) return null;
  try {
    await db.prepare('INSERT INTO invites (inviter_user_id, invitee_user_id, invite_code) VALUES (?, ?, ?)')
      .bind(row.user_id, inviteeUserId, code).run();
    return { inviterUserId: row.user_id, inviteeUserId, inviteCode: code };
  } catch {
    return null;
  }
}

export async function rewardInviteRegistration(db, inviteeUserId) {
  const invite = await db.prepare('SELECT * FROM invites WHERE invitee_user_id = ? AND register_rewarded = 0').bind(inviteeUserId).first();
  if (!invite) return null;
  const cfg = await getPointConfig(db);
  if (cfg.points_invite_register > 0) {
    await addPoints(db, invite.inviter_user_id, cfg.points_invite_register, 'invite_register', `邀请用户 ${inviteeUserId} 注册`, inviteeUserId);
  }
  await db.prepare('UPDATE invites SET register_rewarded = 1 WHERE id = ?').bind(invite.id).run();
  return invite;
}

export async function rewardInviteMembership(db, inviteeUserId) {
  const invite = await db.prepare('SELECT * FROM invites WHERE invitee_user_id = ? AND member_rewarded = 0').bind(inviteeUserId).first();
  if (!invite) return null;
  const cfg = await getPointConfig(db);
  if (cfg.points_invite_member > 0) {
    await addPoints(db, invite.inviter_user_id, cfg.points_invite_member, 'invite_member', `邀请用户 ${inviteeUserId} 成为会员`, inviteeUserId);
  }
  await db.prepare('UPDATE invites SET member_rewarded = 1 WHERE id = ?').bind(invite.id).run();
  return invite;
}

function normalizeSiteBaseUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(String(value).trim());
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    return url.origin;
  } catch {
    return '';
  }
}

async function getInviteBaseUrl(db, request) {
  const configured = normalizeSiteBaseUrl((await getConfig(db, 'siteBaseUrl'))?.value || '');
  if (configured) return configured;
  const url = new URL(request.url);
  return url.origin;
}

export async function handlePointStatus(request, env) {
  const userId = request.session.userId;
  const [balance, config, inviteCode, active] = await Promise.all([
    getPointBalance(env.DB, userId),
    getPointConfig(env.DB),
    getOrCreateInviteCode(env.DB, userId),
    getActiveMembership(env.DB, userId),
  ]);
  const baseUrl = await getInviteBaseUrl(env.DB, request);
  const inviteUrl = `${baseUrl}/login.html?invite=${encodeURIComponent(inviteCode)}`;
  return json({ ok: true, points: balance, config, inviteCode, inviteUrl, isMember: !!active });
}

export async function handleDailyCheckin(request, env) {
  const userId = request.session.userId;
  const limited = await enforceRateLimit(env, request, 'daily-checkin', userId, { limit: 5, ttl: 3600 });
  if (limited) return limited;
  const day = todayString();
  const existing = await env.DB.prepare('SELECT * FROM daily_checkins WHERE user_id = ? AND checkin_date = ?').bind(userId, day).first();
  if (existing) return json({ error: 'already_checked_in', message: '今天已经签到过了', points: existing.points }, 400);
  const cfg = await getPointConfig(env.DB);
  const points = randomInt(cfg.points_checkin_min, cfg.points_checkin_max);
  await env.DB.prepare('INSERT INTO daily_checkins (user_id, checkin_date, points) VALUES (?, ?, ?)').bind(userId, day, points).run();
  const balance = await addPoints(env.DB, userId, points, 'daily_checkin', `每日签到 ${day}`, day);
  return json({ ok: true, points, balance: balance?.balance || 0, message: `签到成功，获得 ${points} 积分` });
}

export async function handlePointExchange(request, env) {
  const userId = request.session.userId;
  const limited = await enforceRateLimit(env, request, 'point-exchange', userId, { limit: 10, ttl: 600 });
  if (limited) return limited;
  const cfg = await getPointConfig(env.DB);
  const balance = await getPointBalance(env.DB, userId);
  if ((balance?.balance || 0) < cfg.points_exchange_cost) {
    return json({ error: 'insufficient_points', message: '积分不足' }, 400);
  }
  const spent = await spendPoints(env.DB, userId, cfg.points_exchange_cost, 'exchange_membership', `兑换 ${cfg.points_exchange_days} 天会员`);
  if (!spent) return json({ error: 'insufficient_points', message: '积分不足' }, 400);
  const result = await addMembership(env.DB, { userId, days: cfg.points_exchange_days, source: 'points_exchange', sourceId: null });
  await rewardInviteMembership(env.DB, userId);
  return json({ ok: true, spent: cfg.points_exchange_cost, days: cfg.points_exchange_days, balance: spent.balance, expireDate: result?.expire, message: `兑换成功，增加 ${cfg.points_exchange_days} 天会员` });
}
