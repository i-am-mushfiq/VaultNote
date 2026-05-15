import { fs } from './fs';
import { pathUtils } from './pathUtils';

export const LOCK_FILENAME = '.vaultnote-lock.json';

interface LockFile {
  version: 1;
  salt: string;   // base64url
  hash: string;   // base64url — PBKDF2-derived key hash
  lockedAt: string;
}

// ── Crypto helpers ────────────────────────────────────────────────────────────

function toBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function fromBase64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const raw = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as Uint8Array<ArrayBuffer>, iterations: 200_000, hash: 'SHA-256' },
    raw,
    { name: 'AES-GCM', length: 256 },
    true,          // exportable so we can hash it for verification
    ['encrypt'],
  );
}

async function hashKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key);
  const digest = await crypto.subtle.digest('SHA-256', raw);
  return toBase64(digest);
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function setDirectoryLock(dirPath: string, password: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key  = await deriveKey(password, salt);
  const hash = await hashKey(key);

  const lockFile: LockFile = {
    version: 1,
    salt: toBase64(salt.buffer),
    hash,
    lockedAt: new Date().toISOString(),
  };

  await fs.writeTextFile(
    pathUtils.join(dirPath, LOCK_FILENAME),
    JSON.stringify(lockFile, null, 2),
  );
}

export async function verifyDirectoryPassword(
  dirPath: string,
  password: string,
): Promise<boolean> {
  try {
    const raw  = await fs.readTextFile(pathUtils.join(dirPath, LOCK_FILENAME));
    const lock: LockFile = JSON.parse(raw);
    const salt = fromBase64(lock.salt);
    const key  = await deriveKey(password, salt);
    const hash = await hashKey(key);
    return hash === lock.hash;
  } catch {
    return false;
  }
}

export async function removeDirectoryLock(dirPath: string): Promise<void> {
  await fs.removePath(pathUtils.join(dirPath, LOCK_FILENAME), false);
}

export async function isDirectoryLocked(dirPath: string): Promise<boolean> {
  return fs.exists(pathUtils.join(dirPath, LOCK_FILENAME));
}
