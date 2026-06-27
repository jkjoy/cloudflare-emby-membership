// src/utils.js — 通用工具函数
export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html;charset=UTF-8' },
  });
}

// 使用 Web Crypto API 做密码哈希（SHA-256）
export async function hashPassword(password, salt) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + ':' + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function generateSalt() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function generateCode(prefix = 'EMBY') {
  const arr = new Uint8Array(12);
  crypto.getRandomValues(arr);
  const suffix = Array.from(arr).map(b => b.toString(36).toUpperCase()).join('');
  return `${prefix}-${suffix.slice(0, 16)}`;
}

export function parseBody(request) {
  return request.json();
}