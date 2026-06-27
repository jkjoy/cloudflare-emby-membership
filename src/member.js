// src/member.js — 会员状态查询/管理
import { json, parseBody } from './utils.js';
import { getActiveMembership, getUserMemberships, addMembership, getUserById } from './db.js';

// 查看当前用户的会员状态
export async function handleMemberStatus(request, env) {
  const userId = request.session.userId;
  const active = await getActiveMembership(env.DB, userId);
  const history = await getUserMemberships(env.DB, userId);

  return json({
    ok: true,
    isActive: !!active,
    activeMembership: active ? {
      startDate: active.start_date,
      expireDate: active.expire_date,
      daysLeft: Math.max(0, Math.floor((new Date(active.expire_date + 'Z') - new Date()) / 86400000)),
    } : null,
    history: history.results,
  });
}

// 管理员手动给用户加天数
export async function handleGrantDays(request, env) {
  const { userId, days } = await parseBody(request);
  if (!userId || !days || days < 1) {
    return json({ error: 'invalid_input', message: '参数错误' }, 400);
  }

  const user = await getUserById(env.DB, userId);
  if (!user) return json({ error: 'not_found', message: '用户不存在' }, 404);

  const result = await addMembership(env.DB, {
    userId,
    days,
    source: 'admin_grant',
    sourceId: request.session.userId,
  });

  if (!result) {
    return json({ error: 'db_error', message: '添加失败' }, 500);
  }

  return json({
    ok: true,
    message: `已为用户 ${user.username} 增加 ${days} 天会员`,
    expireDate: result.expire,
  });
}