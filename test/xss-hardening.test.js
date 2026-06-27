import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

describe('frontend XSS hardening', () => {
  it('defines a shared escapeHTML helper in app.js', () => {
    const app = readFileSync('./frontend/assets/app.js', 'utf-8');

    expect(app).toContain('function escapeHTML');
    expect(app).toContain('&amp;');
    expect(app).toContain('&lt;');
    expect(app).toContain('&#39;');
  });

  it('escapes dynamic dashboard fields before inserting via innerHTML', () => {
    const html = readFileSync('./frontend/dashboard.html', 'utf-8') + readFileSync('./frontend/assets/dashboard.js', 'utf-8');

    expect(html).toContain('escapeHTML(username)');
    expect(html).toContain('escapeHTML(line.name');
    expect(html).toContain('escapeHTML(line.url');
    expect(html).toContain('escapeHTML(h.source');
    expect(html).toContain('escapeHTML(e.message)');
  });

  it('escapes dynamic admin fields before inserting via innerHTML', () => {
    const html = readFileSync('./frontend/admin.html', 'utf-8') + readFileSync('./frontend/assets/admin.js', 'utf-8');

    expect(html).toContain('escapeHTML(u.username)');
    expect(html).toContain('escapeHTML(u.email');
    expect(html).toContain('escapeHTML(c.code)');
    expect(html).toContain('escapeHTML(c.usedBy');
    expect(html).toContain('escapeHTML(h.source');
    expect(html).toContain('escapeHTML(e.message)');
  });
});
