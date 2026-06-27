import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

describe('admin front-office navigation', () => {
  it('does not automatically redirect admins away from the front dashboard', () => {
    const html = readFileSync('./frontend/dashboard.html', 'utf-8');

    expect(html).not.toContain("if (currentUser.role === 'admin') {\n          window.location.href = '/admin';");
    expect(html).toContain("currentUser.role === 'admin' ? 'inline-block' : 'none'");
    expect(html).toContain("document.getElementById('admin-btn').addEventListener('click'");
    expect(html).toContain("window.location.href = '/admin'");
  });
});
