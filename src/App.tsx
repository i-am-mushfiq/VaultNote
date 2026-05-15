import { useEffect } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import { useVaultStore } from '@/stores/vaultStore';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useAutoSave } from '@/hooks/useAutoSave';
import VaultPicker from '@/components/VaultPicker';
import Layout from '@/components/Layout';

// Shift HSL lightness by `delta` (e.g. 0.08 to lighten)
function adjustLightness(hex: string, delta: number): string {
  if (!hex || typeof hex !== 'string') return '#9b8ef5'; // safe fallback
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let hue = 0, sat = 0;
  let lit = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    sat = lit > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r)      hue = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) hue = ((b - r) / d + 2) / 6;
    else                hue = ((r - g) / d + 4) / 6;
  }
  lit = Math.max(0, Math.min(1, lit + delta));
  const h2r = (p: number, q: number, t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  let nr, ng, nb;
  if (sat === 0) { nr = ng = nb = lit; } else {
    const q = lit < 0.5 ? lit * (1 + sat) : lit + sat - lit * sat;
    const p = 2 * lit - q;
    nr = h2r(p, q, hue + 1/3); ng = h2r(p, q, hue); nb = h2r(p, q, hue - 1/3);
  }
  return '#' + [nr, ng, nb].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}

export default function App() {
  const { settings } = useSettingsStore();
  const { currentVault } = useVaultStore();

  // Apply accent colour CSS variables
  useEffect(() => {
    const color = settings.accentColor ?? '#7c6af0';
    const root  = document.documentElement;
    root.style.setProperty('--accent',       color);
    root.style.setProperty('--accent-hover', adjustLightness(color, 0.08));
  }, [settings.accentColor]);

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement;
    const applyTheme = (theme: 'dark' | 'light') => {
      root.setAttribute('data-theme', theme);
    };

    if (settings.theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      applyTheme(mq.matches ? 'dark' : 'light');
      const handler = (e: MediaQueryListEvent) => applyTheme(e.matches ? 'dark' : 'light');
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    } else {
      applyTheme(settings.theme);
    }
  }, [settings.theme]);

  // Apply CSS variables for typography
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--editor-font-size', `${settings.editorFontSize}px`);
    root.style.setProperty('--editor-line-height', String(settings.editorLineHeight));
  }, [settings.editorFontSize, settings.editorLineHeight]);

  useKeyboardShortcuts();
  useAutoSave();

  return currentVault ? <Layout /> : <VaultPicker />;
}
