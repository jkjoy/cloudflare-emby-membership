// test/api.test.js — 核心函数单元测试
import { existsSync, readdirSync } from 'fs';
import { describe, it, expect } from 'vitest';

// ====== utils 测试 ======
describe('utils', () => {
  it('generateCode should produce valid EMBY format', async () => {
    const { generateCode } = await import('../src/utils.js');
    const code = generateCode();
    expect(code).toMatch(/^EMBY-/);
    expect(code.length).toBeGreaterThan(15);
  });

  it('generateCode should produce different codes on each call', async () => {
    const { generateCode } = await import('../src/utils.js');
    const code1 = generateCode();
    const code2 = generateCode();
    expect(code1).not.toBe(code2);
  });

  it('generateSalt should return a 32-character hex string', async () => {
    const { generateSalt } = await import('../src/utils.js');
    const salt = generateSalt();
    expect(salt).toMatch(/^[0-9a-f]{32}$/);
  });

  it('hashPassword should produce consistent results with same salt', async () => {
    const { hashPassword, generateSalt } = await import('../src/utils.js');
    const salt = generateSalt();
    const h1 = await hashPassword('test123', salt);
    const h2 = await hashPassword('test123', salt);
    expect(h1).toBe(h2);
    expect(h1.length).toBe(64); // SHA-256 = 64 hex chars
  });

  it('hashPassword should produce different results with different salts', async () => {
    const { hashPassword, generateSalt } = await import('../src/utils.js');
    const h1 = await hashPassword('test123', generateSalt());
    const h2 = await hashPassword('test123', generateSalt());
    expect(h1).not.toBe(h2);
  });

  it('json should produce correct Response', async () => {
    const { json } = await import('../src/utils.js');
    const res = json({ ok: true, message: 'hello' }, 200);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.message).toBe('hello');
  });

  it('json should default to 200 status', async () => {
    const { json } = await import('../src/utils.js');
    const res = json({ ok: true });
    expect(res.status).toBe(200);
  });

  it('json should set Content-Type header', async () => {
    const { json } = await import('../src/utils.js');
    const res = json({ ok: true });
    expect(res.headers.get('Content-Type')).toBe('application/json');
  });

  it('html should produce correct Response', async () => {
    const { html } = await import('../src/utils.js');
    const res = html('<h1>Hello</h1>', 200);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe('<h1>Hello</h1>');
    expect(res.headers.get('Content-Type')).toBe('text/html;charset=UTF-8');
  });

  it('html should default to 200 status', async () => {
    const { html } = await import('../src/utils.js');
    const res = html('<p>test</p>');
    expect(res.status).toBe(200);
  });

  it('parseBody should be a function', async () => {
    const { parseBody } = await import('../src/utils.js');
    expect(typeof parseBody).toBe('function');
  });
});

// ====== constants 测试 ======
describe('constants', () => {
  it('SESSION_TTL should be 604800 (7 days in seconds)', async () => {
    const { SESSION_TTL } = await import('../src/constants.js');
    expect(SESSION_TTL).toBe(604800);
  });
});

// ====== 项目文件完整性测试 ======
describe('project file integrity', () => {
  it('all src/ source files should exist', () => {
    const expectedFiles = [
      'index.js',
      'utils.js',
      'constants.js',
      'middleware.js',
      'auth.js',
      'db.js',
      'card.js',
      'member.js',
      'admin.js',
      'emby.js',
      'cron.js',
    ];
    for (const file of expectedFiles) {
      expect(existsSync(`./src/${file}`)).toBe(true);
    }
  });

  it('all src/ modules should be importable', async () => {
    const modules = [
      '../src/utils.js',
      '../src/constants.js',
      '../src/middleware.js',
      '../src/auth.js',
      '../src/db.js',
      '../src/card.js',
      '../src/member.js',
      '../src/admin.js',
      '../src/emby.js',
      '../src/cron.js',
    ];
    for (const mod of modules) {
      // Just verify import doesn't throw
      const m = await import(mod);
      expect(m).toBeDefined();
    }
  });
});