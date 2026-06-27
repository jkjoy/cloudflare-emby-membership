// src/middleware.js — 认证中间件 + 会话管理
import { json } from './utils.js';
import { SESSION_TTL } from './constants.js';

const PUBLIC_PATHS = [
  '/api/auth/login', '/api/auth/register',
  '/api/health', '/api/site/config',
  '/login', '/dashboard', '/admin',
  '/index.html', '/dashboard.html', '/admin.html',
  '/assets/',
];

function isPublic(path) {
  if (path === '/') return true;
  return PUBLIC_PATHS.some(p => path === p || path.startsWith(p));
}

function isAdminPath(path) {
  return path.startsWith('/api/admin/');
}

export async function getSession(kv, cookie) {
  if (!cookie) return null;
  const raw = await kv.get(`session:${cookie}`, 'json');
  return raw;
}

export async function createSession(kv, userId, username, role) {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  const sessionId = Array.from(arr).map(b => b.toString(36)).join('');
  const session = { userId, username, role, createdAt: Date.now() };
  await kv.put(`session:${sessionId}`, JSON.stringify(session), { expirationTtl: SESSION_TTL });
  return sessionId;
}

export async function destroySession(kv, sessionId) {
  await kv.delete(`session:${sessionId}`);
}

function getCookieValue(request, name) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(new RegExp(`${name}=([^;]+)`));
  return match ? match[1] : null;
}

export async function authMiddleware(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  // 静态文件和公开 API 无需鉴权
  if (isPublic(path)) return null;

  const sessionId = getCookieValue(request, 'session');
  const session = sessionId ? await env.SESSION_KV.get(`session:${sessionId}`, 'json') : null;

  if (!session) {
    return json({ error: 'unauthorized', message: '请先登录' }, 401);
  }

  // 管理员路径检查
  if (isAdminPath(path) && session.role !== 'admin') {
    return json({ error: 'forbidden', message: '无权限' }, 403);
  }

  // 将 session 和 sessionId 附加到 request
  request.session = session;
  request.sessionId = sessionId;
  return null;
}