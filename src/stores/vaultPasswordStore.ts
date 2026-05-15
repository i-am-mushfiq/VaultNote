import { create } from 'zustand';
import { fs } from '@/lib/fs';
import { pathUtils } from '@/lib/pathUtils';
import { createIntelLock, verifyIntelPassword, type IntelLockFile } from '@/lib/vaultCrypto';

const LOCK_FILENAME = '.vaultnote-intel.lock';

interface VaultPasswordStore {
  lockFile:   IntelLockFile | null;
  password:   string | null;  // in-memory session password only
  isLocked:   boolean;        // true = lock file exists
  isUnlocked: boolean;        // true = password verified this session

  loadLock:   (vaultPath: string) => Promise<void>;
  createLock: (vaultPath: string, password: string) => Promise<void>;
  unlock:     (password: string) => Promise<boolean>;
  lock:       () => void;
  removeLock: (vaultPath: string) => Promise<void>;
}

export const useVaultPasswordStore = create<VaultPasswordStore>((set, get) => ({
  lockFile:   null,
  password:   null,
  isLocked:   false,
  isUnlocked: false,

  async loadLock(vaultPath) {
    try {
      const raw  = await fs.readTextFile(pathUtils.join(vaultPath, LOCK_FILENAME));
      const lock = JSON.parse(raw) as IntelLockFile;
      set({ lockFile: lock, isLocked: true });
    } catch {
      set({ lockFile: null, isLocked: false });
    }
  },

  async createLock(vaultPath, password) {
    const lock = await createIntelLock(password);
    await fs.writeTextFile(pathUtils.join(vaultPath, LOCK_FILENAME), JSON.stringify(lock, null, 2));
    set({ lockFile: lock, password, isLocked: true, isUnlocked: true });
  },

  async unlock(password) {
    const { lockFile } = get();
    if (!lockFile) { set({ password, isUnlocked: true }); return true; }
    const ok = await verifyIntelPassword(lockFile, password);
    if (ok) set({ password, isUnlocked: true });
    return ok;
  },

  lock() { set({ password: null, isUnlocked: false }); },

  async removeLock(vaultPath) {
    try { await fs.writeTextFile(pathUtils.join(vaultPath, LOCK_FILENAME), ''); } catch {}
    try { await fs.removePath(pathUtils.join(vaultPath, LOCK_FILENAME)); } catch {}
    set({ lockFile: null, password: null, isLocked: false, isUnlocked: false });
  },
}));
