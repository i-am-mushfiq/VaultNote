import { invoke } from '@tauri-apps/api/core';

export interface DirEntryInfo {
  name: string;
  path: string;
  is_file: boolean;
  is_directory: boolean;
  modified?: number;
  size?: number;
}

export const fs = {
  readTextFile: (path: string): Promise<string> =>
    invoke('read_text_file', { path }),

  writeTextFile: (path: string, content: string): Promise<void> =>
    invoke('write_text_file', { path, content }),

  readDir: (path: string): Promise<DirEntryInfo[]> =>
    invoke('read_dir', { path }),

  createDir: (path: string): Promise<void> =>
    invoke('create_dir', { path }),

  removePath: (path: string, recursive = false): Promise<void> =>
    invoke('remove_path', { path, recursive }),

  renamePath: (oldPath: string, newPath: string): Promise<void> =>
    invoke('rename_path', { oldPath, newPath }),

  exists: (path: string): Promise<boolean> =>
    invoke('path_exists', { path }),

  copyFile: (src: string, dst: string): Promise<void> =>
    invoke('copy_file', { src, dst }),

  getFileInfo: (path: string): Promise<DirEntryInfo> =>
    invoke('get_file_info', { path }),

  watchVault: (path: string): Promise<void> =>
    invoke('watch_vault', { path }),

  unwatchVault: (): Promise<void> =>
    invoke('unwatch_vault'),
};
