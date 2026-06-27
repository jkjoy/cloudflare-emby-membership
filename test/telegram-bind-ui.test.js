import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

describe('Telegram bind UI', () => {
  it('adds a dashboard button to generate a Telegram bind code', () => {
    const html = readFileSync('./frontend/dashboard.html', 'utf-8') + readFileSync('./frontend/assets/dashboard.js', 'utf-8');

    expect(html).toContain('id="telegram-bind-section"');
    expect(html).toContain('id="telegram-bind-btn"');
    expect(html).toContain('id="telegram-binding-info"');
    expect(html).toContain("API.get('/api/telegram/binding'");
    expect(html).toContain("API.post('/api/telegram/bind-code'");
    expect(html).toContain('telegram-bind-result');
    expect(html).toContain('已绑定 Telegram');
  });
});
