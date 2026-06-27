import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

describe('activation UI', () => {
  it('activates account from a single click without asking users to type Emby credentials', () => {
    const html = readFileSync('./frontend/dashboard.html', 'utf-8') + readFileSync('./frontend/assets/dashboard.js', 'utf-8');

    expect(html).toContain('id="activate-btn"');
    expect(html).not.toContain('id="emby-username"');
    expect(html).not.toContain('id="emby-password"');
    expect(html).toContain("API.post('/api/emby/create-account', {})");
    expect(html).toContain('登录密码');
    expect(html).toContain('服务器线路');
  });

  it('admin config can save server lines shown after activation', () => {
    const html = readFileSync('./frontend/admin.html', 'utf-8') + readFileSync('./frontend/assets/admin.js', 'utf-8');

    expect(html).toContain('id="cfg-server-lines"');
    expect(html).toContain('emby_server_lines');
    expect(html).toContain('主线路|https://');
  });
});
