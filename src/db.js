// src/db.js — D1 数据库操作封装
export function getUserById(db, id) {
  return db.prepare('SELECT id, username, email, emby_username, emby_user_id, role, status, created_at FROM users WHERE id = ?').bind(id).first();
}

export function getUserByUsername(db, username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
}

export async function createUser(db, { username, password_hash, email, role = 'user' }) {
  const result = await db.prepare(
    'INSERT INTO users (username, password_hash, email, role) VALUES (?, ?, ?, ?)'
  ).bind(username, password_hash, email || null, role).run();
  return result.meta?.changes > 0;
}

export function getActiveMembership(db, userId) {
  return db.prepare(
    "SELECT * FROM memberships WHERE user_id = ? AND expire_date > datetime('now') ORDER BY expire_date DESC LIMIT 1"
  ).bind(userId).first();
}

export function getUserMemberships(db, userId, limit = 20) {
  return db.prepare(
    'SELECT * FROM memberships WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
  ).bind(userId, limit).all();
}

export async function addMembership(db, { userId, days, source, sourceId = null }) {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const active = await getActiveMembership(db, userId);
  const baseDate = active ? active.expire_date : now;
  const base = new Date(baseDate + 'Z');
  const expire = new Date(base.getTime() + days * 86400000);
  const expireStr = expire.toISOString().replace('T', ' ').slice(0, 19);
  const result = await db.prepare(
    'INSERT INTO memberships (user_id, days_added, start_date, expire_date, source, source_id) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(userId, days, now, expireStr, source, sourceId).run();
  return result.meta?.changes > 0 ? { start: now, expire: expireStr } : null;
}

export function getCardByCode(db, code) {
  return db.prepare('SELECT * FROM activation_codes WHERE code = ?').bind(code).first();
}

export async function useCard(db, cardId, userId) {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const result = await db.prepare(
    "UPDATE activation_codes SET status = 'used', used_by = ?, used_at = ? WHERE id = ? AND status = 'active'"
  ).bind(userId, now, cardId).run();
  return result.meta?.changes > 0;
}

export async function createCard(db, { code, days, createdBy, batchId = null }) {
  const result = await db.prepare(
    'INSERT INTO activation_codes (code, days, created_by, batch_id) VALUES (?, ?, ?, ?)'
  ).bind(code, days, createdBy, batchId).run();
  return result.meta?.changes > 0;
}

export function getCards(db, { status, limit = 50, offset = 0 }) {
  let sql = `
    SELECT
      c.id,
      c.code,
      c.days,
      c.status,
      c.used_by,
      used_user.username AS used_by_username,
      c.used_at,
      c.created_by,
      created_user.username AS created_by_username,
      c.batch_id,
      c.created_at
    FROM activation_codes c
    LEFT JOIN users used_user ON used_user.id = c.used_by
    LEFT JOIN users created_user ON created_user.id = c.created_by
  `;
  const params = [];
  if (status) {
    sql += ' WHERE c.status = ?';
    params.push(status);
  }
  sql += ' ORDER BY c.created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  const result = db.prepare(sql).bind(...params).all();
  return {
    ...result,
    results: (result.results || []).map(function(card) {
      return {
        ...card,
        usedBy: card.used_by_username || (card.used_by ? String(card.used_by) : ''),
        usedById: card.used_by,
        usedAt: card.used_at,
        createdBy: card.created_by_username || (card.created_by ? String(card.created_by) : ''),
        createdById: card.created_by,
        createdAt: card.created_at,
      };
    }),
  };
}

export function getUsersAdmin(db, { limit = 50, offset = 0 }) {
  return db.prepare(
    'SELECT id, username, email, emby_username, role, status, created_at FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).bind(limit, offset).all();
}

export function updateUserEmby(db, userId, { embyUsername, embyUserId }) {
  return db.prepare('UPDATE users SET emby_username = ?, emby_user_id = ? WHERE id = ?')
    .bind(embyUsername, embyUserId, userId).run();
}

export function getConfig(db, key) {
  return db.prepare('SELECT value FROM config WHERE key = ?').bind(key).first();
}

export function setConfig(db, key, value) {
  return db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').bind(key, value).run();
}

export function getAllConfig(db) {
  return db.prepare('SELECT key, value FROM config').all();
}

export function getExpiredMemberships(db) {
  return db.prepare(
    "SELECT m.*, u.emby_user_id, u.emby_username FROM memberships m JOIN users u ON m.user_id = u.id WHERE m.expire_date <= datetime('now') AND u.emby_user_id IS NOT NULL"
  ).all();
}

export async function getUserWithMembership(db, userId) {
  const user = await getUserById(db, userId);
  if (!user) return null;
  const [membership, history] = await Promise.all([
    getActiveMembership(db, userId),
    getUserMemberships(db, userId)
  ]);
  return { ...user, activeMembership: membership, membershipHistory: history.results };
}