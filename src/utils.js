// src/utils.js — 通用工具函数
export function securityHeaders(extra = {}) {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    ...extra,
  };
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: securityHeaders({ 'Content-Type': 'application/json' }),
  });
}

export function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: securityHeaders({ 'Content-Type': 'text/html;charset=UTF-8' }),
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

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export async function createPasswordHash(password, iterations = 100000) {
  const salt = generateSalt();
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: hexToBytes(salt), iterations }, key, 256);
  return `pbkdf2:${iterations}:${salt}:${bytesToHex(new Uint8Array(bits))}`;
}

export async function verifyPasswordHash(password, stored) {
  if (!stored) return false;
  if (stored.startsWith('pbkdf2:')) {
    const [, iterationsRaw, salt, expectedHash] = stored.split(':');
    const iterations = parseInt(iterationsRaw, 10);
    if (!iterations || !salt || !expectedHash) return false;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: hexToBytes(salt), iterations }, key, 256);
    return bytesToHex(new Uint8Array(bits)) === expectedHash;
  }
  const [salt, storedHash] = (stored || ':').split(':');
  if (!salt || !storedHash) return false;
  return (await hashPassword(password, salt)) === storedHash;
}

export function needsPasswordRehash(stored) {
  return !stored || !stored.startsWith('pbkdf2:100000:');
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