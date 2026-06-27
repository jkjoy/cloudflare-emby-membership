// src/emby.js — Emby API 客户端
import { json, parseBody, generateCode } from './utils.js';
import { getConfig, updateUserEmby, getActiveMembership } from './db.js';

// 获取 Emby 配置（兼容新旧配置 key）
async function fetchConfig(db) {
  const baseR = (await getConfig(db, 'emby_base_url')) || (await getConfig(db, 'embyUrl'));
  const keyR = (await getConfig(db, 'emby_api_key')) || (await getConfig(db, 'apiKey'));
  const linesR = (await getConfig(db, 'emby_server_lines')) || (await getConfig(db, 'serverLines'));
  return {
    baseUrl: (baseR && baseR.value) || '',
    apiKey: (keyR && keyR.value) || '',
    serverLinesRaw: (linesR && linesR.value) || '',
  };
}

export function parseServerLines(raw, fallbackUrl = '') {
  const text = (raw || '').trim();
  const lines = text
    ? text.split(/\r?\n/).map(function(line) {
        const trimmed = line.trim();
        if (!trimmed) return null;
        const parts = trimmed.split('|').map(function(part) { return part.trim(); });
        if (parts.length >= 2 && parts[0] && parts[1]) {
          return { name: parts[0], url: parts.slice(1).join('|').trim() };
        }
        return { name: '线路', url: trimmed };
      }).filter(Boolean)
    : [];

  if (lines.length > 0) return lines;
  return fallbackUrl ? [{ name: '默认线路', url: fallbackUrl }] : [];
}

function generatePassword(length = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(function(byte) { return chars[byte % chars.length]; }).join('');
}

function generateEmbyUsername(user) {
  const base = String(user?.username || 'user')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 20) || 'user';
  const suffix = generateCode('').replace(/[^A-Z0-9]/g, '').toLowerCase().slice(0, 4);
  return base + '_' + user.id + '_' + suffix;
}

// 测试连接
export async function handleCheckConnection(request, env) {
  let config;
  if (request.method === 'POST') {
    const body = await parseBody(request);
    config = { baseUrl: body.baseUrl || body.embyUrl, apiKey: body.apiKey };
  } else {
    config = await fetchConfig(env.DB);
  }
  if (!config.baseUrl || !config.apiKey) {
    return json({ error: 'not_configured' }, 400);
  }
  try {
    const base = config.baseUrl.replace(/\/+$/, '');
    const url = base + '/emby/System/Info' + '?api_key=' + config.apiKey;
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const info = await res.json();
    return json({ ok: true, serverName: info.ServerName, version: info.Version });
  } catch (e) {
    return json({ error: 'connection_failed', message: e.message }, 502);
  }
}

// 同步/绑定
export async function handleSyncUser(request, env) {
  const config = await fetchConfig(env.DB);
  if (!config.baseUrl || !config.apiKey) {
    return json({ error: 'not_configured' }, 400);
  }
  const body = await parseBody(request);
  const embyUsername = body.embyUsername;
  if (!embyUsername) return json({ error: 'invalid_input' }, 400);
  const userId = request.session.userId;
  try {
    const base = config.baseUrl.replace(/\/+$/, '');
    const res = await fetch(base + '/emby/Users/Public');
    if (!res.ok) throw new Error('Emby API error: ' + res.status);
    const users = await res.json();
    const matched = users.find(function(u) { return u.Name === embyUsername; });
    if (!matched) {
      return json({ error: 'not_found', message: '未找到用户' }, 404);
    }
    await updateUserEmby(env.DB, userId, { embyUsername, embyUserId: matched.Id });
    return json({ ok: true, message: '绑定成功' });
  } catch (e) {
    return json({ error: 'sync_failed', message: e.message }, 502);
  }
}

// 创建 Emby 账号（需有活跃会员）：自动生成账号密码并绑定当前会员
export async function handleCreateEmbyAccount(request, env) {
  const config = await fetchConfig(env.DB);
  if (!config.baseUrl || !config.apiKey) {
    return json({ error: 'not_configured', message: 'Emby 未配置，请联系管理员' }, 400);
  }

  const userId = request.session.userId;

  // 检查会员
  const membership = await getActiveMembership(env.DB, userId);
  if (!membership) {
    return json({ error: 'no_membership', message: '请先兑换卡密开通会员' }, 403);
  }

  // 检查是否已绑定
  const { getUserById } = await import('./db.js');
  const user = await getUserById(env.DB, userId);
  if (user && user.emby_user_id) {
    return json({ error: 'already_bound', message: '已绑定 Emby 账号' }, 400);
  }
  if (!user) {
    return json({ error: 'user_not_found', message: '用户不存在' }, 404);
  }

  const embyUsername = generateEmbyUsername(user);
  const embyPassword = generatePassword();
  const base = config.baseUrl.replace(/\/+$/, '');
  const ak = config.apiKey;
  const hdrs = { 'Content-Type': 'application/json', 'X-Emby-Token': ak };

  try {
    // 1. 创建用户
    const cr = await fetch(base + '/emby/Users/New', {
      method: 'POST', headers: hdrs,
      body: JSON.stringify({ Name: embyUsername }),
    });
    if (!cr.ok) {
      const txt = await cr.text();
      throw new Error('创建失败: ' + (txt || cr.statusText));
    }
    const cu = await cr.json();
    const eid = cu.Id;

    // 2. 设置密码
    const pw = await fetch(base + '/emby/Users/' + eid + '/Password', {
      method: 'POST', headers: hdrs,
      body: JSON.stringify({ Id: eid, CurrentPw: '', NewPw: embyPassword }),
    });
    if (!pw.ok) throw new Error('密码设置失败');

    // 3. 启用用户
    const policy = await fetch(base + '/emby/Users/' + eid + '/Policy', {
      method: 'POST', headers: hdrs,
      body: JSON.stringify({ IsDisabled: false }),
    });
    if (!policy.ok) throw new Error('账号启用失败');

    // 4. 绑定本地
    await updateUserEmby(env.DB, userId, { embyUsername, embyUserId: eid });

    return json({
      ok: true,
      message: 'Emby 账号创建成功，请保存以下登录信息',
      data: {
        username: embyUsername,
        password: embyPassword,
        userId: eid,
        serverLines: parseServerLines(config.serverLinesRaw, base),
      },
    });
  } catch (e) {
    return json({ error: 'create_failed', message: e.message }, 502);
  }
}

// 通过 Emby API 启用/禁用用户（cron 调用）
export async function setEmbyUserPolicy(baseUrl, apiKey, embyUserId, opts) {
  const clean = baseUrl.replace(/\/+$/, '');
  const res = await fetch(clean + '/emby/Users/' + embyUserId + '/Policy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Emby-Token': apiKey },
    body: JSON.stringify({ IsDisabled: opts.isDisabled }),
  });
  return res.ok;
}
