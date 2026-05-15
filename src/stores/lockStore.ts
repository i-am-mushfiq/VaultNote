import { create } from 'zustand';

interface LockStore {
  // Paths confirmed as having a lock file (discovered lazily on first click)
  lockedPaths: Set<string>;
  // Paths unlocked for this session (correct password entered)
  sessionUnlocked: Set<string>;

  markLocked: (path: string) => void;
  markPermanentlyUnlocked: (path: string) => void; // lock file removed
  grantSession: (path: string) => void;
  revokeSession: (path: string) => void;
  isLocked: (path: string) => boolean;
  isSessionUnlocked: (path: string) => boolean;
}

export const useLockStore = create<LockStore>((set, get) => ({
  lockedPaths: new Set(),
  sessionUnlocked: new Set(),

  markLocked: (path) =>
    set((s) => ({ lockedPaths: new Set([...s.lockedPaths, path]) })),

  markPermanentlyUnlocked: (path) =>
    set((s) => {
      const locked = new Set(s.lockedPaths);
      const session = new Set(s.sessionUnlocked);
      locked.delete(path);
      session.delete(path);
      return { lockedPaths: locked, sessionUnlocked: session };
    }),

  grantSession: (path) =>
    set((s) => ({ sessionUnlocked: new Set([...s.sessionUnlocked, path]) })),

  revokeSession: (path) =>
    set((s) => {
      const next = new Set(s.sessionUnlocked);
      next.delete(path);
      return { sessionUnlocked: next };
    }),

  isLocked: (path) => get().lockedPaths.has(path),
  isSessionUnlocked: (path) => get().sessionUnlocked.has(path),
}));
