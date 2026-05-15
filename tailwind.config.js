/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', 'monospace'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        vault: {
          bg: 'var(--bg-base)',
          surface: 'var(--bg-surface)',
          hover: 'var(--bg-hover)',
          active: 'var(--bg-active)',
          border: 'var(--border)',
          accent: 'var(--accent)',
          'accent-hover': 'var(--accent-hover)',
          text: 'var(--text-primary)',
          muted: 'var(--text-secondary)',
          faint: 'var(--text-muted)',
        },
      },
    },
  },
  plugins: [],
};
