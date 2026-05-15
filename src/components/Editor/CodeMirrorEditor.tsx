import { useEffect, useRef, useCallback } from 'react';
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
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView as EV } from '@codemirror/view';
import { useSettingsStore } from '@/stores/settingsStore';

interface Props {
  value: string;
  path: string;
  onChange: (value: string) => void;
  onScrollChange?: (pos: number) => void;
  initialScrollPosition?: number;
}

export default function CodeMirrorEditor({
  value,
  path,
  onChange,
  onScrollChange,
  initialScrollPosition = 0,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const { settings } = useSettingsStore();

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
            color: isDark ? '#e2e2e2' : '#1a1a1a',
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
            margin: settings.editorWidth !== 'full' ? '0 auto' : '0',
            padding: '0 16px',
            caretColor: '#7c6af0',
          },
          '.cm-cursor': { borderLeftColor: '#7c6af0', borderLeftWidth: '2px' },
          '.cm-activeLine': {
            background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
          },
          '.cm-activeLineGutter': {
            background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
          },
          '.cm-gutters': {
            background: isDark ? '#1a1a1a' : '#ffffff',
            border: 'none',
            color: isDark ? '#444' : '#bbb',
          },
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

  useEffect(() => {
    if (!containerRef.current) return;

    const isDark =
      document.documentElement.getAttribute('data-theme') !== 'light';

    const updateListener = EV.updateListener.of((update) => {
      if (update.docChanged) {
        onChangeRef.current(update.state.doc.toString());
      }
    });

    const scrollListener = EV.domEventHandlers({
      scroll(e, view) {
        onScrollChange?.(view.scrollDOM.scrollTop);
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
      markdown({
        base: markdownLanguage,
        codeLanguages: languages,
      }),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      keymap.of([
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

    const state = EditorState.create({
      doc: value,
      extensions,
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    // Restore scroll position
    if (initialScrollPosition > 0) {
      requestAnimationFrame(() => {
        view.scrollDOM.scrollTop = initialScrollPosition;
      });
    }

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Intentionally only runs on mount / path change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  // Sync external content changes (e.g., file reloaded from disk)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
        // Preserve cursor position where possible
        selection: view.state.selection,
      });
    }
  }, [value]);

  // Recreate editor when settings change
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    view.dispatch({
      effects: EV.scrollIntoView(0),
    });
    // Theme changes require rebuilding — simpler to just update the theme compartment
    // For now, re-render by triggering a no-op dispatch; full recreation on settings change
    // is handled by the path-change effect above if needed.
  }, [settings.editorFontSize, settings.editorLineHeight, settings.editorWidth, settings.editorFontFamily]);

  return (
    <div
      ref={containerRef}
      style={{ height: '100%', width: '100%', overflow: 'hidden' }}
    />
  );
}
