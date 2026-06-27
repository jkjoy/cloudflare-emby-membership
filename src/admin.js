// src/admin.js — 管理后台路由分发
import { json, parseBody } from './utils.js';
import { getConfig, setConfig, getAllConfig, getUsersAdmin, getUserWithMembership } from './db.js';
import { handleGenerateCard, handleCardList, handleDisableCard } from './card.js';

// 用户列表
export async function handleAdminUserList(request, env) {
  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get('limit')) || 50;
  const offset = parseInt(url.searchParams.get('offset')) || 0;
  const result = await getUsersAdmin(env.DB, { limit, offset });
  return json({ ok: true, users: result.results });
}

// 用户详情（含会员记录）
export async function handleAdminUserDetail(request, env) {
  const url = new URL(request.url);
  const userId = parseInt(url.searchParams.get('id'));
  if (!userId) return json({ error: 'invalid_input' }, 400);
  const data = await getUserWithMembership(env.DB, userId);
  if (!data) return json({ error: 'not_found' }, 404);
  return json({ ok: true, user: data });
}

// 手动加天数
export async function handleAdminGrantDays(request, env) {
  const { userId, days } = await parseBody(request);
  if (!userId || !days || days < 1) {
    return json({ error: 'invalid_input', message: '参数错误' }, 400);
  }
  // 使用 member.js 中的逻辑
  const { getUserById, addMembership } = await import('./db.js');
  const user = await getUserById(env.DB, userId);
  if (!user) return json({ error: 'not_found', message: '用户不存在' }, 404);
  const result = await addMembership(env.DB, { userId, days, source: 'admin_grant', sourceId: request.session.userId });
  if (!result) return json({ error: 'db_error', message: '添加失败' }, 500);
  return json({ ok: true, message: `已为用户 ${user.username} 增加 ${days} 天会员`, expireDate: result.expire });
}

// 获取系统配置
export async function handleAdminGetConfig(request, env) {
  const configs = await getAllConfig(env.DB);
  const obj = {};
  for (const row of configs.results) obj[row.key] = row.value;
  return json({ ok: true, config: obj });
}

// 更新系统配置
export async function handleAdminSetConfig(request, env) {
  const config = await parseBody(request);
  for (const [key, value] of Object.entries(config)) {
    if (typeof value === 'string' && value.trim()) {
      await setConfig(env.DB, key, value.trim());
    }
  }
  return json({ ok: true, message: '配置已保存' });
}

// 管理后台路由总入口
export async function handleAdmin(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace('/api/admin', '');

  if (path === '/card/generate') return handleGenerateCard(request, env);
  if (path === '/card/list') return handleCardList(request, env);
  if (path === '/card/disable') return handleDisableCard(request, env);
  if (path === '/user/list') return handleAdminUserList(request, env);
  if (path === '/user/detail') return handleAdminUserDetail(request, env);
  if (path === '/user/grant') return handleAdminGrantDays(request, env);
  if (path === '/config') {
    if (request.method === 'GET') return handleAdminGetConfig(request, env);
    if (request.method === 'POST') return handleAdminSetConfig(request, env);
  }
  return json({ error: 'not_found' }, 404);
}