export interface VaultInfo {
  path: string;
  name: string;
  lastOpened: string; // ISO date string
}

export interface FileNode {
  id: string;
  path: string;
  name: string;
  isDirectory: boolean;
  isExpanded: boolean;
  depth: number;
  parentPath: string | null;
  childrenLoaded: boolean;
  children: FileNode[];
  modified?: number;
  size?: number;
}

export interface Tab {
  id: string;
  path: string;
  title: string;
  isPinned: boolean;
  isDirty: boolean;
  scrollPosition: number;
  savedContent: string; // content as last loaded/saved from disk
}

export interface SearchResult {
  path: string;
  title: string;
  excerpt: string;
  lineNumber: number;
}

export interface SearchIndex {
  path: string;
  title: string;
  content: string;
}

export interface Settings {
  theme: 'dark' | 'light' | 'system';
  editorFontSize: number;
  editorLineHeight: number;
  editorWidth: 'full' | 'readable' | 'narrow';
  editorFontFamily: 'mono' | 'sans';
  showPreview: boolean;
  previewSide: 'right' | 'bottom';
  autoSaveInterval: number;
  sidebarWidth: number;
  wordWrap: boolean;
  spellCheck: boolean;
  editorPreviewSplit: number; // 0.2 – 0.8, fraction of width given to editor
}

export interface CommandItem {
  id: string;
  label: string;
  description?: string;
  shortcut?: string;
  icon?: string;
  action: () => void;
  category: 'file' | 'view' | 'navigation' | 'editor' | 'vault';
}

export type Theme = 'dark' | 'light' | 'system';
