const names = [
  'bg',
  'surface',
  'surface-2',
  'border',
  'text',
  'muted',
  'faint',
  'accent',
  'accent-soft',
  'on-accent',
  'danger',
  'success',
  'warning',
];

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: Object.fromEntries(names.map((n) => [n, `rgb(var(--color-${n}) / <alpha-value>)`])),
      borderRadius: {
        card: '14px',
      },
    },
  },
  plugins: [],
};
