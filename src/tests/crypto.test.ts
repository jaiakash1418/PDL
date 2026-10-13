import { describe, expect, it } from 'vitest';
import { sha256Hex, hashPassword, verifyPassword, shortHash } from '../lib/crypto';

describe('sha256Hex', () => {
  it('matches the known SHA-256 empty-string vector', async () => {
    expect(await sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('matches the known SHA-256 "abc" vector', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('password hashing (PBKDF2)', () => {
  it('verifies the correct password and rejects the wrong one', async () => {
    const { hash, salt } = await hashPassword('Stratavex@123');
    expect(await verifyPassword('Stratavex@123', hash, salt)).toBe(true);
    expect(await verifyPassword('wrong-password', hash, salt)).toBe(false);
  });

  it('produces different salts and hashes for the same password', async () => {
    const a = await hashPassword('same-password');
    const b = await hashPassword('same-password');
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });

  it('reproduces the same hash given the same salt', async () => {
    const a = await hashPassword('reproducible', '00112233445566778899aabbccddeeff');
    const b = await hashPassword('reproducible', '00112233445566778899aabbccddeeff');
    expect(a.hash).toBe(b.hash);
  });
});

describe('shortHash', () => {
  it('truncates to the requested length deterministically', async () => {
    const h1 = await shortHash('stable-key');
    const h2 = await shortHash('stable-key');
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(12);
    expect(await shortHash('stable-key', 8)).toHaveLength(8);
  });
});
