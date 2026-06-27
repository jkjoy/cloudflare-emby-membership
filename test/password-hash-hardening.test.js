import { describe, expect, it } from 'vitest';
import { createPasswordHash, verifyPasswordHash, needsPasswordRehash, hashPassword, generateSalt } from '../src/utils.js';

describe('password hash hardening', () => {
  it('creates PBKDF2 password hashes for new passwords', async () => {
    const stored = await createPasswordHash('secret-pass');

    expect(stored).toMatch(/^pbkdf2:100000:[0-9a-f]{32}:[0-9a-f]+$/);
    expect(await verifyPasswordHash('secret-pass', stored)).toBe(true);
    expect(await verifyPasswordHash('wrong-pass', stored)).toBe(false);
    expect(needsPasswordRehash(stored)).toBe(false);
  });

  it('verifies legacy salted SHA-256 hashes and marks them for upgrade', async () => {
    const salt = generateSalt();
    const legacyHash = await hashPassword('old-secret', salt);
    const stored = salt + ':' + legacyHash;

    expect(await verifyPasswordHash('old-secret', stored)).toBe(true);
    expect(await verifyPasswordHash('wrong-secret', stored)).toBe(false);
    expect(needsPasswordRehash(stored)).toBe(true);
  });
});
