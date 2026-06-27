import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

describe('user settings UI', () => {
  it('shows a change-password panel in user dashboard', () => {
    const html = readFileSync('./frontend/dashboard.html', 'utf-8');

    expect(html).toContain('id="change-password-section"');
    expect(html).toContain('id="old-password"');
    expect(html).toContain('id="new-password"');
    expect(html).toContain('id="change-password-btn"');
    expect(html).toContain("API.post('/api/user/change-password'");
  });

  it('uses member status serverLines so activated users always see server lines after refresh', () => {
    const html = readFileSync('./frontend/dashboard.html', 'utf-8');

    expect(html).toContain('var latestServerLines = []');
    expect(html).toContain('latestServerLines = data.serverLines || []');
    expect(html).toContain('showEmbyInfo(currentUser, { serverLines: latestServerLines })');
  });
});
