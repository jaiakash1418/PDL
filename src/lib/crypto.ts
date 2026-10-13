// Cryptography helpers built on the Web Crypto API.
// Used for: file hashing (SHA-256), password storage (PBKDF2), and the
// genuine hash-chained audit log (SHA-256 over prev-hash + record payload).

function subtle(): SubtleCrypto {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Web Crypto API unavailable in this environment.');
  }
  return globalThis.crypto.subtle;
}

function bufToHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

export async function sha256Hex(input: string | ArrayBuffer | Uint8Array): Promise<string> {
  const data = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const digest = await subtle().digest('SHA-256', data as BufferSource);
  return bufToHex(digest);
}

export async function hashFile(file: Blob): Promise<string> {
  const buf = await file.arrayBuffer();
  return sha256Hex(buf);
}

const PBKDF2_ITERATIONS = 120000;

export async function hashPassword(password: string, saltHex?: string): Promise<{ hash: string; salt: string }> {
  const salt = saltHex ?? bufToHex(globalThis.crypto.getRandomValues(new Uint8Array(16)).buffer);
  const enc = new TextEncoder();
  const keyMaterial = await subtle().importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle().deriveBits(
    { name: 'PBKDF2', salt: hexToBytes(salt) as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  return { hash: bufToHex(bits), salt };
}

export async function verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
  const res = await hashPassword(password, salt);
  return timingSafeEqual(res.hash, hash);
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function shortHash(input: string, len = 12): Promise<string> {
  return (await sha256Hex(input)).slice(0, len);
}
