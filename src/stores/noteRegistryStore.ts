import { create } from 'zustand';
import { fs } from '@/lib/fs';
import { pathUtils } from '@/lib/pathUtils';

const REGISTRY_FILENAME = '.vaultnote-registry.json';

// Disk format: { [uuid]: path }
type DiskRegistry = Record<string, string>;

interface NoteRegistryStore {
  /** uuid → absolute path */
  uuidToPath: Map<string, string>;
  /** absolute path → uuid */
  pathToUuid: Map<string, string>;

  /** Load (or create) registry for a vault. Prunes missing paths. */
  loadRegistry: (vaultPath: string) => Promise<void>;
  /** Persist current registry to disk. */
  saveRegistry: (vaultPath: string) => Promise<void>;
  /** Get or create UUID for a path. */
  getOrCreate: (path: string) => string;
  /** Update a path (UUID stays the same — used on rename/move). */
  movePath: (oldPath: string, newPath: string) => void;
  /** Remove a path and its UUID from the registry. */
  deregister: (path: string) => void;
  /** Look up UUID for a path, or null. */
  getUuid: (path: string) => string | null;
  /** Look up path for a UUID, or null. */
  getPath: (uuid: string) => string | null;
}

function generateUuid(): string {
  return crypto.randomUUID();
}

// Private: vault path remembered for auto-save
let _vaultPath: string | null = null;

export const useNoteRegistryStore = create<NoteRegistryStore>((set, get) => ({
  uuidToPath: new Map(),
  pathToUuid: new Map(),

  async loadRegistry(vaultPath) {
    _vaultPath = vaultPath;
    const registryPath = pathUtils.join(vaultPath, REGISTRY_FILENAME);
    try {
      const raw: DiskRegistry = JSON.parse(await fs.readTextFile(registryPath));
      const uuidToPath = new Map<string, string>();
      const pathToUuid = new Map<string, string>();
      for (const [uuid, p] of Object.entries(raw)) {
        uuidToPath.set(uuid, p);
        pathToUuid.set(p, uuid);
      }
      set({ uuidToPath, pathToUuid });
    } catch {
      // No registry yet — start fresh
      set({ uuidToPath: new Map(), pathToUuid: new Map() });
    }
  },

  async saveRegistry(vaultPath) {
    const { uuidToPath } = get();
    const disk: DiskRegistry = {};
    for (const [uuid, p] of uuidToPath) disk[uuid] = p;
    await fs.writeTextFile(
      pathUtils.join(vaultPath, REGISTRY_FILENAME),
      JSON.stringify(disk),
    );
  },

  getOrCreate(path) {
    const { pathToUuid, uuidToPath } = get();
    const existing = pathToUuid.get(path);
    if (existing) return existing;
    const uuid = generateUuid();
    const nextUuid = new Map(uuidToPath); nextUuid.set(uuid, path);
    const nextPath = new Map(pathToUuid); nextPath.set(path, uuid);
    set({ uuidToPath: nextUuid, pathToUuid: nextPath });
    // Fire-and-forget persist
    if (_vaultPath) get().saveRegistry(_vaultPath).catch(() => {});
    return uuid;
  },

  movePath(oldPath, newPath) {
    const { pathToUuid, uuidToPath } = get();
    const uuid = pathToUuid.get(oldPath);
    if (!uuid) return;
    const nextUuid = new Map(uuidToPath); nextUuid.set(uuid, newPath);
    const nextPath = new Map(pathToUuid); nextPath.delete(oldPath); nextPath.set(newPath, uuid);
    set({ uuidToPath: nextUuid, pathToUuid: nextPath });
    if (_vaultPath) get().saveRegistry(_vaultPath).catch(() => {});
  },

  deregister(path) {
    const { pathToUuid, uuidToPath } = get();
    const uuid = pathToUuid.get(path);
    if (!uuid) return;
    const nextUuid = new Map(uuidToPath); nextUuid.delete(uuid);
    const nextPath = new Map(pathToUuid); nextPath.delete(path);
    set({ uuidToPath: nextUuid, pathToUuid: nextPath });
    if (_vaultPath) get().saveRegistry(_vaultPath).catch(() => {});
  },

  getUuid: (path) => get().pathToUuid.get(path) ?? null,
  getPath: (uuid) => get().uuidToPath.get(uuid) ?? null,
}));
