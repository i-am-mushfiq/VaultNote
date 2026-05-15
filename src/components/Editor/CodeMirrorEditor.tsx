import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { EditorState } from '@codemirror/state';
import {
  EditorView,
  keymap,
  highlightActiveLine,
  lineNumbers,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  highlightActiveLineGutter,
} from '@codemirror/view';
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
  indentOnInput,
} from '@codemirror/language';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { useUIStore } from '@/stores/uiStore';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView as EV } from '@codemirror/view';
import { useSettingsStore } from '@/stores/settingsStore';
import { useVaultStore } from '@/stores/vaultStore';
import { fs } from '@/lib/fs';
import { pathUtils } from '@/lib/pathUtils';

export interface EditorHandle {
  scrollToLine: (lineNum: number) => void;
}

interface Props {
  value: string;
  path: string;
  onChange: (value: string) => void;
  onScrollChange?: (pos: number) => void;
  onVisibleLineChange?: (lineNum: number) => void;
  initialScrollPosition?: number;
}

const CodeMirrorEditor = forwardRef<EditorHandle, Props>(function CodeMirrorEditor(
  { value, path, onChange, onScrollChange, onVisibleLineChange, initialScrollPosition = 0 },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef      = useRef<EditorView | null>(null);
  const onChangeRef  = useRef(onChange);
  onChangeRef.current = onChange;
  const onVisibleLineChangeRef = useRef(onVisibleLineChange);
  onVisibleLineChangeRef.current = onVisibleLineChange;

  const { settings } = useSettingsStore();

  // ── Imperative handle ────────────────────────────────────────────────────

  useImperativeHandle(ref, () => ({
    scrollToLine(lineNum: number) {
      const view = viewRef.current;
      if (!view) return;
      const doc = view.state.doc;
      const clamped = Math.max(1, Math.min(lineNum, doc.lines));
      const pos = doc.line(clamped).from;
      view.dispatch({ effects: EV.scrollIntoView(pos, { y: 'start', yMargin: 40 }) });
    },
  }), []);

  // ── Theme factory ────────────────────────────────────────────────────────

  const buildTheme = useCallback(
    (isDark: boolean) =>
      EV.theme(
        {
          '&': {
            height: '100%',
            fontSize: `${settings.editorFontSize}px`,
            fontFamily:
              settings.editorFontFamily === 'mono'
                ? "'JetBrains Mono', 'Fira Code', Consolas, monospace"
                : "'Inter', system-ui, sans-serif",
            background: isDark ? '#1a1a1a' : '#ffffff',
            color:      isDark ? '#e2e2e2' : '#1a1a1a',
          },
          '.cm-scroller': {
            lineHeight: String(settings.editorLineHeight),
            padding: settings.editorWidth === 'full' ? '16px 24px' : '16px',
          },
          '.cm-content': {
            maxWidth:
              settings.editorWidth === 'readable'
                ? '800px'
                : settings.editorWidth === 'narrow'
                ? '600px'
                : 'none',
            margin:  settings.editorWidth !== 'full' ? '0 auto' : '0',
            padding: '0 16px',
            caretColor: '#7c6af0',
          },
          '.cm-cursor':            { borderLeftColor: '#7c6af0', borderLeftWidth: '2px' },
          '.cm-activeLine':        { background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)' },
          '.cm-activeLineGutter':  { background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)' },
          '.cm-gutters':           { background: isDark ? '#1a1a1a' : '#ffffff', border: 'none', color: isDark ? '#444' : '#bbb' },
          '.cm-lineNumbers .cm-gutterElement': { padding: '0 8px 0 4px' },
          '.cm-selectionBackground': {
            background: isDark ? '#3d3d3d !important' : '#d8e0ff !important',
          },
          '&.cm-focused .cm-selectionBackground': {
            background: isDark ? '#3a3a3a !important' : '#c8d4ff !important',
          },
          '.cm-matchingBracket': {
            background: isDark ? 'rgba(124,106,240,0.2)' : 'rgba(91,79,207,0.15)',
            outline: '1px solid var(--accent)',
          },
        },
        { dark: isDark },
      ),
    [settings],
  );

  // ── Image drag-drop ──────────────────────────────────────────────────────

  const handleDragOver = (e: React.DragEvent) => {
    const hasImages = Array.from(e.dataTransfer.items).some(
      (item) => item.kind === 'file' && /^image\//i.test(item.type),
    );
    if (hasImages) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    const imageFiles = Array.from(e.dataTransfer.files).filter(
      (f) => /^image\//i.test(f.type) || /\.(png|jpe?g|gif|webp|svg)$/i.test(f.name),
    );
    if (imageFiles.length === 0) return;
    e.preventDefault();
    e.stopPropagation();

    const vault = useVaultStore.getState().currentVault;
    if (!vault) return;

    const assetsDir = pathUtils.join(vault.path, '_assets');
    try { await fs.createDir(assetsDir); } catch { /* already exists */ }

    const view = viewRef.current;
    let insertPos = view?.posAtCoords({ x: e.clientX, y: e.clientY }) ?? view?.state.doc.length ?? 0;

    for (const file of imageFiles) {
      const dest  = pathUtils.join(assetsDir, file.name);
      const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
      await fs.writeBinaryFile(dest, bytes);

      if (view) {
        const text = `![${pathUtils.stem(file.name)}](_assets/${file.name})\n`;
        view.dispatch({ changes: { from: insertPos, insert: text } });
        insertPos += text.length;
      }
    }
  };

  // ── Editor lifecycle ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current) return;

    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';

    const updateListener = EV.updateListener.of((update) => {
      if (update.docChanged) {
        onChangeRef.current(update.state.doc.toString());
      }
    });

    const scrollListener = EV.domEventHandlers({
      scroll(_e, view) {
        onScrollChange?.(view.scrollDOM.scrollTop);
        // Emit first visible line for preview sync
        const cb = onVisibleLineChangeRef.current;
        if (cb) {
          const ranges = view.visibleRanges;
          if (ranges.length > 0) {
            const lineNum = view.state.doc.lineAt(ranges[0].from).number;
            cb(lineNum);
          }
        }
      },
    });

    const extensions = [
      history(),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      highlightSelectionMatches(),
      lineNumbers(),
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      keymap.of([
        // Intercept Ctrl+F before searchKeymap so our modal opens instead
        {
          key: 'Ctrl-f',
          run: () => { useUIStore.getState().openSearch(); return true; },
        },
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        indentWithTab,
      ]),
      EV.lineWrapping,
      buildTheme(isDark),
      ...(isDark ? [oneDark] : []),
      updateListener,
      scrollListener,
    ];

    const state = EditorState.create({ doc: value, extensions });
    const view  = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    if (initialScrollPosition > 0) {
      requestAnimationFrame(() => { view.scrollDOM.scrollTop = initialScrollPosition; });
    }

    return () => { view.destroy(); viewRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  // Sync external content changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes:   { from: 0, to: current.length, insert: value },
        selection: view.state.selection,
      });
    }
  }, [value]);

  return (
    <div
      ref={containerRef}
      style={{ height: '100%', width: '100%', overflow: 'hidden' }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    />
  );
});

export default CodeMirrorEditor;
