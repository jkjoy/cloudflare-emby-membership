import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

describe('site title configuration', () => {
  it('exposes a public site config endpoint and frontend applies configured title', () => {
    const index = readFileSync('./src/index.js', 'utf-8');
    const middleware = readFileSync('./src/middleware.js', 'utf-8');
    const app = readFileSync('./frontend/assets/app.js', 'utf-8');

    expect(middleware).toContain('/api/site/config');
    expect(index).toContain("path === '/api/site/config'");
    expect(app).toContain("API.get('/api/site/config')");
    expect(app).toContain('document.title');
    expect(app).toContain('siteTitle');
  });
});
