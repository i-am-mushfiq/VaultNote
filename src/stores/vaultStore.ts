import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { VaultInfo } from '@/types';
import { pathUtils } from '@/lib/pathUtils';

interface VaultStore {
  currentVault: VaultInfo | null;
  recentVaults: VaultInfo[];
  openVault: (path: string) => void;
  closeVault: () => void;
  addRecentVault: (vault: VaultInfo) => void;
  removeRecentVault: (path: string) => void;
}

export const useVaultStore = create<VaultStore>()(
  persist(
    (set) => ({
      currentVault: null,
      recentVaults: [],

      openVault: (path: string) => {
        const vault: VaultInfo = {
          path,
          name: pathUtils.vaultName(path),
          lastOpened: new Date().toISOString(),
        };
        set((state) => ({
          currentVault: vault,
          recentVaults: [
            vault,
            ...state.recentVaults.filter((v) => v.path !== path),
          ].slice(0, 10),
        }));
      },

      closeVault: () => set({ currentVault: null }),

      addRecentVault: (vault) =>
        set((state) => ({
          recentVaults: [
            vault,
            ...state.recentVaults.filter((v) => v.path !== vault.path),
          ].slice(0, 10),
        })),

      removeRecentVault: (path) =>
        set((state) => ({
          recentVaults: state.recentVaults.filter((v) => v.path !== path),
        })),
    }),
    { name: 'vaultnote-vault' },
  ),
);
