// src/auth.js — 注册/登录/登出/用户信息
import { json, parseBody, createPasswordHash, verifyPasswordHash, needsPasswordRehash, securityHeaders } from './utils.js';
import { createSession, destroySession } from './middleware.js';
import { getUserByUsername, createUser, getUserWithMembership, getUserAuthById, updateUserPassword } from './db.js';
import { enforceRateLimit } from './rateLimit.js';
import { createInviteIfValid, getOrCreateInviteCode, rewardInviteRegistration } from './points.js';

export async function handleRegister(request, env) {
  const { username, password, email, inviteCode } = await parseBody(request);
  if (!username || !password || username.length < 3 || password.length < 6) {
    return json({ error: 'invalid_input', message: '用户名至少3位，密码至少6位' }, 400);
  }
  const limited = await enforceRateLimit(env, request, 'register', username.toLowerCase(), { limit: 5, ttl: 3600 });
  if (limited) return limited;

  const existing = await getUserByUsername(env.DB, username);
  if (existing) {
    return json({ error: 'duplicate', message: '用户名已存在' }, 409);
  }

  const passwordHash = await createPasswordHash(password);
  const success = await createUser(env.DB, { username, password_hash: passwordHash, email });
  if (!success) {
    return json({ error: 'db_error', message: '注册失败' }, 500);
  }

  const createdUser = await getUserByUsername(env.DB, username);
  if (createdUser) {
    await getOrCreateInviteCode(env.DB, createdUser.id);
    await createInviteIfValid(env.DB, inviteCode, createdUser.id);
    await rewardInviteRegistration(env.DB, createdUser.id);
  }

  return json({ ok: true, message: '注册成功' });
}

export async function handleLogin(request, env) {
  const { username, password } = await parseBody(request);
  if (!username || !password) {
    return json({ error: 'invalid_input', message: '请输入用户名和密码' }, 400);
  }
  const limited = await enforceRateLimit(env, request, 'login', String(username).toLowerCase(), { limit: 5, ttl: 600 });
  if (limited) return limited;

  const user = await getUserByUsername(env.DB, username);
  if (!user) {
    return json({ error: 'auth_failed', message: '用户名或密码错误' }, 401);
  }

  if (!(await verifyPasswordHash(password, user.password_hash))) {
    return json({ error: 'auth_failed', message: '用户名或密码错误' }, 401);
  }
  if (needsPasswordRehash(user.password_hash)) {
    await updateUserPassword(env.DB, user.id, await createPasswordHash(password));
  }

  const sessionId = await createSession(env.SESSION_KV, user.id, user.username, user.role);
  return new Response(JSON.stringify({
    ok: true,
    user: { id: user.id, username: user.username, role: user.role },
  }), {
    status: 200,
    headers: securityHeaders({
      'Content-Type': 'application/json',
      'Set-Cookie': `session=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${86400 * 7}`,
    }),
  });
}

export async function handleLogout(request, env) {
  if (request.sessionId) {
    await destroySession(env.SESSION_KV, request.sessionId);
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: securityHeaders({
      'Content-Type': 'application/json',
      'Set-Cookie': 'session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
    }),
  });
}

export async function handleUserInfo(request, env) {
  const { userId } = request.session;
  const data = await getUserWithMembership(env.DB, userId);
  if (!data) return json({ error: 'not_found' }, 404);
  return json({ ok: true, user: data });
}

export async function handleChangePassword(request, env) {
  const { oldPassword, newPassword } = await parseBody(request);
  if (!oldPassword || !newPassword || newPassword.length < 6) {
    return json({ error: 'invalid_input', message: '请输入旧密码，新密码至少 6 位' }, 400);
  }
  const limited = await enforceRateLimit(env, request, 'change-password', request.session.userId, { limit: 5, ttl: 600 });
  if (limited) return limited;

  const userId = request.session.userId;
  const user = await getUserAuthById(env.DB, userId);
  if (!user) return json({ error: 'not_found', message: '用户不存在' }, 404);

  if (!(await verifyPasswordHash(oldPassword, user.password_hash))) {
    return json({ error: 'auth_failed', message: '旧密码错误' }, 401);
  }

  const result = await updateUserPassword(env.DB, userId, await createPasswordHash(newPassword));
  if (result.meta?.changes < 1) {
    return json({ error: 'db_error', message: '密码修改失败' }, 500);
  }

  return json({ ok: true, message: '密码修改成功' });
}
