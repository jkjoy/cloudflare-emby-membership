import { generateCode } from './utils.js';

export function createTelegramCode() {
  return 'TG-' + generateCode('').replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

export async function generateTelegramBindCode(db, userId) {
  const code = createTelegramCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
  await db.prepare(
    'INSERT INTO telegram_bind_codes (user_id, code, expires_at) VALUES (?, ?, ?)'
  ).bind(userId, code, expiresAt).run();
  return code;
}

export function getTelegramBindingByTelegramUser(db, telegramUserId) {
  return db.prepare('SELECT * FROM telegram_bindings WHERE telegram_user_id = ?')
    .bind(String(telegramUserId)).first();
}

export async function consumeTelegramBindCode(db, code, telegramUser, chatId) {
  const normalized = String(code || '').trim().toUpperCase();
  const row = await db.prepare(
    "SELECT * FROM telegram_bind_codes WHERE code = ? AND used_at IS NULL AND expires_at > datetime('now')"
  ).bind(normalized).first();
  if (!row) return null;

  await db.prepare('UPDATE telegram_bind_codes SET used_at = datetime(\'now\') WHERE code = ?')
    .bind(normalized).run();
  await db.prepare(
    `INSERT OR REPLACE INTO telegram_bindings
      (user_id, telegram_user_id, telegram_username, telegram_chat_id, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))`
  ).bind(row.user_id, String(telegramUser.id), telegramUser.username || '', String(chatId)).run();

  return {
    userId: row.user_id,
    telegramUserId: String(telegramUser.id),
    telegramUsername: telegramUser.username || '',
    telegramChatId: String(chatId),
  };
}
