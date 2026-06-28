import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

describe('points and invite feature wiring', () => {
  it('adds database tables for points, checkins, invite codes and invite rewards', () => {
    const sql = readFileSync('./migrations/003_points_invites.sql', 'utf-8');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS user_points');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS point_transactions');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS daily_checkins');
    expect(sql).toContain('UNIQUE(user_id, checkin_date)');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS user_invite_codes');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS invites');
    expect(sql).toContain('invitee_user_id   INTEGER NOT NULL UNIQUE');
  });

  it('wires points APIs and invite registration into frontend/backend', () => {
    const index = readFileSync('./src/index.js', 'utf-8');
    const auth = readFileSync('./src/auth.js', 'utf-8');
    const card = readFileSync('./src/card.js', 'utf-8');
    const dashboard = readFileSync('./frontend/dashboard.html', 'utf-8') + readFileSync('./frontend/assets/dashboard.js', 'utf-8');
    const login = readFileSync('./frontend/login.html', 'utf-8') + readFileSync('./frontend/assets/login.js', 'utf-8');

    expect(index).toContain("/api/points/status");
    expect(index).toContain("/api/points/checkin");
    expect(index).toContain("/api/points/exchange");
    expect(auth).toContain('inviteCode');
    expect(auth).toContain('rewardInviteRegistration');
    expect(card).toContain('rewardInviteMembership');
    expect(dashboard).toContain('id="points-section"');
    expect(dashboard).toContain("API.post('/api/points/checkin'");
    expect(dashboard).toContain("API.post('/api/points/exchange'");
    expect(dashboard).toContain('id="invite-link"');
    expect(readFileSync('./src/points.js', 'utf-8')).toContain('siteBaseUrl');
    expect(login).toContain('id="reg-invite-code"');
    expect(login).toContain('new URLSearchParams(window.location.search).get');
  });

  it('adds admin settings and Emby media overview fields', () => {
    const adminHtml = readFileSync('./frontend/admin.html', 'utf-8');
    const adminJs = readFileSync('./frontend/assets/admin.js', 'utf-8');
    const adminBackend = readFileSync('./src/admin.js', 'utf-8');

    expect(adminHtml).toContain('id="stat-emby-movies"');
    expect(adminHtml).toContain('id="stat-emby-series"');
    expect(adminHtml).toContain('id="stat-emby-episodes"');
    expect(adminHtml).toContain('id="cfg-checkin-min"');
    expect(adminHtml).toContain('id="cfg-site-base-url"');
    expect(adminHtml).toContain('id="cfg-exchange-cost"');
    expect(adminHtml).toContain('id="cfg-invite-member"');
    expect(adminJs).toContain("API.get('/api/admin/overview'");
    expect(adminJs).toContain("points_checkin_min");
    expect(adminBackend).toContain('/emby/Items/Counts');
    expect(adminBackend).toContain('handleAdminOverview');
  });
});
