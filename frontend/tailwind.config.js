/** @type {import('tailwindcss').Config} */
const v = (n) => `rgb(var(--${n}) / <alpha-value>)`
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: v('bg'), surface: v('surface'), sunken: v('sunken'), ink: v('ink'), muted: v('muted'), line: v('line'),
        primary: v('primary'), 'on-primary': v('on-primary'), 'primary-soft': v('primary-soft'), accent: v('accent'),
        danger: v('danger'), 'danger-soft': v('danger-soft'), warn: v('warn'), 'warn-soft': v('warn-soft'), ok: v('ok'), 'ok-soft': v('ok-soft'),
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'Figtree', 'system-ui', 'sans-serif'],
        sans: ['Figtree', '"Noto Sans Devanagari"', '"Noto Sans Telugu"', '"Noto Sans Tamil"', '"Noto Sans Kannada"', '"Noto Sans Malayalam"', '"Noto Sans Bengali"', 'system-ui', 'sans-serif'],
      },
      keyframes: { rise: { from: { opacity: 0, transform: 'translateY(6px)' }, to: { opacity: 1, transform: 'none' } } },
      animation: { rise: 'rise .25s ease-out both' },
    },
  },
  plugins: [],
}
