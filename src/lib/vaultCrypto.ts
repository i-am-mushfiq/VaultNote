// ── Vault Intelligence Lock — AES-GCM encryption for metadata files ───────────
// Uses the same PBKDF2 pattern as directoryLock.ts but encrypts whole JSON blobs.

function toB64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function fromB64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const raw = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as Uint8Array<ArrayBuffer>, iterations: 200_000, hash: 'SHA-256' },
    raw,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function hashKey(password: string, salt: Uint8Array): Promise<string> {
  const key = await deriveKey(password, salt);
  const raw = await crypto.subtle.exportKey('raw', key);
  const digest = await crypto.subtle.digest('SHA-256', raw);
  return toB64(digest);
}

// ── Public lock-file operations ───────────────────────────────────────────────

export interface IntelLockFile {
  version: 1;
  salt: string;   // base64
  hash: string;   // base64 — PBKDF2 key hash for password verification
  lockedAt: string;
}

export async function createIntelLock(password: string): Promise<IntelLockFile> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await hashKey(password, salt);
  return { version: 1, salt: toB64(salt.buffer), hash, lockedAt: new Date().toISOString() };
}

export async function verifyIntelPassword(lock: IntelLockFile, password: string): Promise<boolean> {
  try {
    const salt = fromB64(lock.salt);
    const hash = await hashKey(password, salt);
    return hash === lock.hash;
  } catch { return false; }
}

// ── Metadata encryption / decryption ─────────────────────────────────────────

export interface EncryptedBlob {
  encrypted: true;
  salt: string;
  iv: string;
  data: string; // base64 ciphertext
}

export async function encryptJson(obj: unknown, password: string): Promise<EncryptedBlob> {
  const salt  = crypto.getRandomValues(new Uint8Array(16));
  const iv    = crypto.getRandomValues(new Uint8Array(12));
  const key   = await deriveKey(password, salt);
  const plain = new TextEncoder().encode(JSON.stringify(obj));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as Uint8Array<ArrayBuffer> }, key, plain);
  return { encrypted: true, salt: toB64(salt.buffer), iv: toB64(iv.buffer), data: toB64(cipher) };
}

export async function decryptJson<T>(blob: EncryptedBlob, password: string): Promise<T> {
  const salt  = fromB64(blob.salt);
  const iv    = fromB64(blob.iv);
  const data  = fromB64(blob.data);
  const key   = await deriveKey(password, salt);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(iv.buffer as ArrayBuffer) }, key, new Uint8Array(data.buffer as ArrayBuffer));
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}

export function isEncryptedBlob(v: unknown): v is EncryptedBlob {
  return typeof v === 'object' && v !== null && (v as any).encrypted === true;
}
