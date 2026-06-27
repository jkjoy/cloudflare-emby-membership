import { existsSync, readFileSync } from 'fs';
import { describe, it, expect } from 'vitest';

describe('project initialization', () => {
  it('package.json exists and is valid', () => {
    const raw = readFileSync('./package.json', 'utf-8');
    const pkg = JSON.parse(raw);
    expect(pkg.name).toBe('emby-membership');
    expect(pkg.type).toBe('module');
    expect(pkg.scripts).toHaveProperty('dev');
    expect(pkg.scripts).toHaveProperty('deploy');
    expect(pkg.scripts).toHaveProperty('test');
    expect(pkg.devDependencies).toHaveProperty('wrangler');
    expect(pkg.devDependencies).toHaveProperty('vitest');
  });

  it('wrangler.toml exists', () => {
    const raw = readFileSync('./wrangler.toml', 'utf-8');
    expect(raw).toContain('name = "emby-membership"');
    expect(raw).toContain('compatibility_date');
    expect(raw).toContain('[[d1_databases]]');
    expect(raw).toContain('[[kv_namespaces]]');
    expect(raw).toContain('SESSION_KV');
    expect(raw).toContain('[triggers]');
  });

  it('.env.example exists', () => {
    const raw = readFileSync('./.env.example', 'utf-8');
    expect(raw).toContain('EMBY_BASE_URL');
    expect(raw).toContain('EMBY_API_KEY');
  });

  it('migration 001_init.sql exists with all tables and indexes', () => {
    const raw = readFileSync('./migrations/001_init.sql', 'utf-8');
    expect(raw).toContain('CREATE TABLE IF NOT EXISTS users');
    expect(raw).toContain('CREATE TABLE IF NOT EXISTS memberships');
    expect(raw).toContain('CREATE TABLE IF NOT EXISTS activation_codes');
    expect(raw).toContain('CREATE TABLE IF NOT EXISTS config');
    expect(raw).toContain('CREATE INDEX IF NOT EXISTS idx_memberships_user_id');
    expect(raw).toContain('CREATE INDEX IF NOT EXISTS idx_activation_codes_status');
    expect(raw).toContain('CREATE INDEX IF NOT EXISTS idx_activation_codes_code');
  });

  it('src/db.js exists and exports all expected functions', () => {
    const raw = readFileSync('./src/db.js', 'utf-8');
    const exports = [
      'getUserById', 'getUserByUsername', 'createUser',
      'getActiveMembership', 'getUserMemberships', 'addMembership',
      'getCardByCode', 'useCard', 'createCard',
      'getCards', 'getUsersAdmin', 'updateUserEmby',
      'getConfig', 'setConfig', 'getAllConfig',
      'getExpiredMemberships', 'getUserWithMembership',
    ];
    for (const fn of exports) {
      expect(raw).toMatch(new RegExp(`export\\s+(async\\s+)?function\\s+${fn}`));
    }
  });

  it('node_modules directory exists (npm install ran)', () => {
    expect(existsSync('./node_modules')).toBe(true);
  });

  it('all required directories exist', () => {
    expect(existsSync('./src')).toBe(true);
    expect(existsSync('./migrations')).toBe(true);
    expect(existsSync('./frontend')).toBe(true);
    expect(existsSync('./frontend/assets')).toBe(true);
    expect(existsSync('./test')).toBe(true);
  });
});