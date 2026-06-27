// src/index.js — Worker 主入口
import { json } from './utils.js';
import { authMiddleware } from './middleware.js';
import { handleRegister, handleLogin, handleLogout, handleUserInfo, handleChangePassword } from './auth.js';
import { handleRedeem } from './card.js';
import { handleMemberStatus } from './member.js';
import { handleAdmin } from './admin.js';
import { handleCheckConnection, handleSyncUser, handleCreateEmbyAccount } from './emby.js';
import { handleCron } from './cron.js';

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  try {
    // 认证中间件（公开路径放行，API 路径鉴权）
    const authError = await authMiddleware(request, env);
    if (authError) return authError;

    // === 用户认证 ===
    if (path === '/api/auth/register' && request.method === 'POST') return handleRegister(request, env);
    if (path === '/api/auth/login' && request.method === 'POST') return handleLogin(request, env);
    if (path === '/api/auth/logout' && request.method === 'POST') return handleLogout(request, env);

    // === 用户信息 ===
    if (path === '/api/user/info') return handleUserInfo(request, env);
    if (path === '/api/user/change-password' && request.method === 'POST') return handleChangePassword(request, env);

    // === 会员 ===
    if (path === '/api/member/status') return handleMemberStatus(request, env);

    // === 卡密 ===
    if (path === '/api/card/redeem' && request.method === 'POST') return handleRedeem(request, env);

    // === Emby 集成 ===
    if (path === '/api/emby/check-connection') return handleCheckConnection(request, env);
    if (path === '/api/emby/sync-user' && request.method === 'POST') return handleSyncUser(request, env);
    if (path === '/api/emby/create-account' && request.method === 'POST') return handleCreateEmbyAccount(request, env);

    // === 管理后台 ===
    if (path.startsWith('/api/admin')) return handleAdmin(request, env);

    // === 健康检查 ===
    if (path === '/api/health') {
      return json({ ok: true, service: 'emby-membership' });
    }

    // === 静态页面欢迎 ===
    if (path === '/' || path === '/index.html') {
      // 重定向到登录页
      return Response.redirect(new URL('/login', url), 302);
    }

    return json({ error: 'not_found' }, 404);
  } catch (e) {
    console.error('Worker error:', e);
    return json({ error: 'internal_error', message: e.message }, 500);
  }
}

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleCron(env));
  },
};