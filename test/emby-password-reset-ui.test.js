import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

describe('Emby password reset UI', () => {
  it('shows reset button for activated Emby account and displays returned password once', () => {
    const html = readFileSync('./frontend/dashboard.html', 'utf-8');

    expect(html).toContain('id="reset-emby-password-btn"');
    expect(html).toContain('id="reset-emby-password-result"');
    expect(html).toContain("API.post('/api/emby/reset-password', {})");
    expect(html).toContain('新 Emby 密码');
    expect(html).toContain('仅本次显示');
  });
});
