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
  showEditor: boolean;
  previewSide: 'right' | 'bottom';
  autoSaveInterval: number;
  sidebarWidth: number;
  wordWrap: boolean;
  spellCheck: boolean;
  editorPreviewSplit: number; // 0.2 – 0.8, fraction of width given to editor
}

export interface Highlight {
  id: string;
  color: string;      // CSS color e.g. '#ffeb3b'
  text: string;       // exact selected text (used for re-matching in DOM)
  sourceLine: number; // nearest data-source-line ancestor when created
  note?: string;      // optional annotation text
  createdAt: string;  // ISO date
}

export interface CanvasNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;   // raw markdown text of the card
  color?: string;    // optional accent colour for the card border
}

export interface CanvasFile {
  version: 1;
  nodes: CanvasNode[];
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
