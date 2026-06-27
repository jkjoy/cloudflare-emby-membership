import { readFileSync, existsSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { securityHeaders } from '../src/utils.js';

const pages = ['login', 'dashboard', 'admin'];

describe('external assets and strict CSP', () => {
  it('moves inline page CSS and JS into static asset files', () => {
    for (const page of pages) {
      const html = readFileSync(`./frontend/${page}.html`, 'utf-8');
      expect(html).not.toMatch(/<style[\s>]/i);
      expect(html).not.toMatch(/<script(?![^>]+src=)[^>]*>/i);
      expect(html).not.toContain('style=');
      expect(html).not.toContain('onclick=');
      expect(html).toContain(`/assets/${page}.css`);
      expect(html).toContain(`/assets/${page}.js`);
      expect(existsSync(`./frontend/assets/${page}.css`)).toBe(true);
      expect(existsSync(`./frontend/assets/${page}.js`)).toBe(true);
    }
  });

  it('uses a CSP without unsafe-inline once inline assets are removed', () => {
    const csp = securityHeaders()['Content-Security-Policy'];

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("style-src 'self'");
    expect(csp).not.toContain('unsafe-inline');
  });
});
