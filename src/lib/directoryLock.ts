import { fs } from './fs';
import { pathUtils } from './pathUtils';

export const LOCK_FILENAME          = '.vaultnote-lock.json';
export const VAULT_ARCHIVE_FILENAME = '.vaultnote-vault';
export const ENCRYPTED_HEADER       = 'VAULTNOTE_ENCRYPTED:1';

interface LockFile {
  version: 1;
  salt: string;   // base64 — PBKDF2 salt
  hash: string;   // base64 — hash of derived key (for password verification)
  lockedAt: string;
}

/** Manifest stored inside the encrypted archive. */
interface VaultArchive {
  version: 1;
  /** Keys are forward-slash relative paths, e.g. "notes/idea.md" */
  files: Record<string, string>;
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
    true,                   // exportable so we can hash for verification
    ['encrypt', 'decrypt'], // both operations needed
  );
}

async function hashKey(key: CryptoKey): Promise<string> {
  const raw    = await crypto.subtle.exportKey('raw', key);
  const digest = await crypto.subtle.digest('SHA-256', raw);
  return toBase64(digest);
}

// ── Content-level encryption / decryption ────────────────────────────────────
//
// On-disk format (plain text, detectable by first line):
//   VAULTNOTE_ENCRYPTED:1
//   <base64 salt — 16 bytes>
//   <base64 iv   — 12 bytes>
//   <base64 AES-GCM ciphertext>

/** Returns true if the string is an encrypted VaultNote payload. */
export function isEncryptedContent(s: string): boolean {
  return typeof s === 'string' && s.startsWith(ENCRYPTED_HEADER);
}

/** Encrypt a plaintext string and return the on-disk representation. */
export async function encryptContent(plaintext: string, password: string): Promise<string> {
  const salt   = crypto.getRandomValues(new Uint8Array(16));
  const iv     = crypto.getRandomValues(new Uint8Array(12));
  const key    = await deriveKey(password, salt);
  const bytes  = new TextEncoder().encode(plaintext);
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as Uint8Array<ArrayBuffer> },
    key,
    bytes,
  );
  return [
    ENCRYPTED_HEADER,
    toBase64(salt.buffer),
    toBase64(iv.buffer),
    toBase64(cipher),
  ].join('\n');
}

/** Decrypt an on-disk encrypted string back to plaintext. Throws on bad password or corrupt data. */
export async function decryptContent(encryptedStr: string, password: string): Promise<string> {
  const lines = encryptedStr.split('\n');
  if (lines[0] !== ENCRYPTED_HEADER || lines.length < 4) {
    throw new Error('Not a valid encrypted VaultNote file');
  }
  const salt  = fromBase64(lines[1]);
  const iv    = fromBase64(lines[2]);
  const data  = fromBase64(lines[3]);
  const key   = await deriveKey(password, salt);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(iv.buffer as ArrayBuffer) },
    key,
    new Uint8Array(data.buffer as ArrayBuffer),
  );
  return new TextDecoder().decode(plain);
}

// ── Vault archive (single-file encrypted directory artifact) ─────────────────
//
// When a directory is locked, ALL .md files inside it (recursively, excluding
// sub-directories that carry their own lock) are packed into ONE encrypted
// JSON blob stored at <dirPath>/.vaultnote-vault. The original .md files are
// then deleted. This means a locked directory exposes NO file-name metadata —
// only the archive file and the lock manifest are present on disk.
//
// On unlock, the archive is decrypted in memory and VaultNote serves the
// virtual file tree from a Map<absPath, content> held in lockStore, without
// ever writing the plaintext back to disk until the lock is permanently removed.

/** Recursively collect all markdown files under dirPath, skipping sub-dirs with their own lock. */
async function collectMdFilesForArchive(
  dirPath: string,
  skipLockFiles = true,
): Promise<string[]> {
  const result: string[] = [];
  let entries;
  try { entries = await fs.readDir(dirPath); } catch { return result; }

  for (const entry of entries) {
    if (entry.is_directory) {
      // Do not recurse into directories that have their own lock —
      // they are a separate security boundary.
      if (skipLockFiles) {
        const subLock = pathUtils.join(entry.path, LOCK_FILENAME);
        const hasOwnLock = await fs.exists(subLock).catch(() => false);
        if (hasOwnLock) continue;
      }
      const sub = await collectMdFilesForArchive(entry.path, skipLockFiles);
      result.push(...sub);
    } else if (
      pathUtils.isMarkdown(entry.path) &&
      entry.name !== LOCK_FILENAME &&
      entry.name !== VAULT_ARCHIVE_FILENAME
    ) {
      result.push(entry.path);
    }
  }
  return result;
}

/**
 * Pack every .md file inside dirPath into a single AES-GCM encrypted JSON
 * archive, then delete the original .md files from disk.
 * Called immediately after writing the lock manifest (setDirectoryLock).
 */
export async function createVaultArchive(
  dirPath: string,
  password: string,
): Promise<void> {
  const files = await collectMdFilesForArchive(dirPath);
  const archiveFiles: Record<string, string> = {};

  for (const absPath of files) {
    // Read raw — should be plaintext at this point (not yet encrypted)
    const content = await fs.readTextFile(absPath).catch(() => '');
    // Compute forward-slash relative path for portability
    const relPath = absPath.slice(dirPath.length + 1).replace(/\\/g, '/');
    archiveFiles[relPath] = isEncryptedContent(content) ? '' : content;
  }

  const manifest: VaultArchive = { version: 1, files: archiveFiles };
  const encrypted = await encryptContent(JSON.stringify(manifest), password);
  await fs.writeTextFile(pathUtils.join(dirPath, VAULT_ARCHIVE_FILENAME), encrypted);

  // Delete original files now that they are safely archived
  for (const absPath of files) {
    await fs.removePath(absPath, false).catch(() => {/* already gone */});
  }

  // Delete any directories that are now empty (best-effort)
  await pruneEmptyDirs(dirPath);
}

/** Remove empty subdirectories inside dirPath (non-recursive order: leaves first). */
async function pruneEmptyDirs(dirPath: string): Promise<void> {
  let entries;
  try { entries = await fs.readDir(dirPath); } catch { return; }
  for (const entry of entries) {
    if (!entry.is_directory) continue;
    await pruneEmptyDirs(entry.path);
    const subEntries = await fs.readDir(entry.path).catch(() => []);
    if (subEntries.length === 0) {
      await fs.removePath(entry.path, false).catch(() => {});
    }
  }
}

/**
 * Decrypt the vault archive and return its contents as a map of
 * absolute path → plaintext content. Does NOT write anything to disk.
 */
export async function openVaultArchive(
  dirPath: string,
  password: string,
): Promise<Record<string, string>> {
  const archivePath = pathUtils.join(dirPath, VAULT_ARCHIVE_FILENAME);
  const encrypted   = await fs.readTextFile(archivePath);
  const json        = await decryptContent(encrypted, password);
  const manifest: VaultArchive = JSON.parse(json);

  const result: Record<string, string> = {};
  for (const [relPath, content] of Object.entries(manifest.files)) {
    // Convert forward-slash relative path back to platform absolute path
    const absPath = pathUtils.join(dirPath, relPath.replace(/\//g, '\\'));
    result[absPath] = content;
  }
  return result;
}

/**
 * Re-encrypt the vault archive with updated contents (e.g. after a file save).
 * `absContents` maps absolute file paths → plaintext content.
 */
export async function saveVaultArchive(
  dirPath: string,
  password: string,
  absContents: Record<string, string>,
): Promise<void> {
  const files: Record<string, string> = {};
  for (const [absPath, content] of Object.entries(absContents)) {
    const relPath = absPath.slice(dirPath.length + 1).replace(/\\/g, '/');
    files[relPath] = content;
  }
  const manifest: VaultArchive = { version: 1, files };
  const encrypted = await encryptContent(JSON.stringify(manifest), password);
  await fs.writeTextFile(pathUtils.join(dirPath, VAULT_ARCHIVE_FILENAME), encrypted);
}

/**
 * Restore all files from the archive to disk and delete the archive.
 * Called when permanently removing a directory lock.
 */
export async function extractVaultArchive(
  dirPath: string,
  password: string,
): Promise<void> {
  const contents = await openVaultArchive(dirPath, password);
  for (const [absPath, content] of Object.entries(contents)) {
    // Ensure parent directory exists before writing
    const parentDir = pathUtils.dirname(absPath);
    const parentExists = await fs.exists(parentDir).catch(() => false);
    if (!parentExists) {
      await fs.createDir(parentDir).catch(() => {});
    }
    await fs.writeTextFile(absPath, content);
  }
  await fs.removePath(pathUtils.join(dirPath, VAULT_ARCHIVE_FILENAME), false);
}

/** Returns true if dirPath contains a vault archive (packed-file artifact). */
export async function hasVaultArchive(dirPath: string): Promise<boolean> {
  return fs.exists(pathUtils.join(dirPath, VAULT_ARCHIVE_FILENAME)).catch(() => false);
}

/**
 * Decrypt individually-encrypted .md files from the OLD per-file format.
 * Only used during migration — new locks always use the archive format.
 */
async function decryptIndividualFiles(dirPath: string, password: string): Promise<void> {
  const files = await collectMdFilesForArchive(dirPath);
  for (const filePath of files) {
    const raw = await fs.readTextFile(filePath).catch(() => '');
    if (isEncryptedContent(raw)) {
      try {
        const plain = await decryptContent(raw, password);
        await fs.writeTextFile(filePath, plain);
      } catch { /* skip files that fail — wrong format / already plain */ }
    }
  }
}

/**
 * Migration shim: if a directory was locked with the old per-file encryption
 * format (no `.vaultnote-vault` present), decrypt the individual files and
 * re-pack them into the archive format automatically.
 *
 * Returns `true` if migration was performed, `false` if the archive already
 * exists (no migration needed).
 */
export async function migrateToArchiveIfNeeded(
  dirPath: string,
  password: string,
): Promise<boolean> {
  const archiveExists = await hasVaultArchive(dirPath);
  if (archiveExists) return false;

  // Old format detected — decrypt individual .md files first …
  await decryptIndividualFiles(dirPath, password);
  // … then pack everything into the archive and remove the originals.
  await createVaultArchive(dirPath, password);
  return true;
}

// ── Public lock API ───────────────────────────────────────────────────────────

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
  return fs.exists(pathUtils.join(dirPath, LOCK_FILENAME)).catch(() => false);
}
