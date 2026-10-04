/**
 * Design tokens: the single source of truth for color. Components use the Tailwind
 * classes generated from these (bg-surface, text-muted, ...); JS-only consumers
 * (icons, placeholders, navigation) use `useColors()`.
 *
 * One accent color. Calm neutrals. Semantic colors used sparingly.
 */

export type ColorName =
  | 'bg'
  | 'surface'
  | 'surface-2'
  | 'border'
  | 'text'
  | 'muted'
  | 'faint'
  | 'accent'
  | 'accent-soft'
  | 'on-accent'
  | 'danger'
  | 'success'
  | 'warning';

export type Palette = Record<ColorName, string>;

export const light: Palette = {
  bg: '#FAFAF9',
  surface: '#FFFFFF',
  'surface-2': '#F2F2F0',
  border: '#E7E6E2',
  text: '#1C1C1A',
  muted: '#6F6E69',
  faint: '#A6A59F',
  accent: '#5B5BD6',
  'accent-soft': '#EDEDFB',
  'on-accent': '#FFFFFF',
  danger: '#D93D42',
  success: '#2B9A66',
  warning: '#C2850C',
};

export const dark: Palette = {
  bg: '#111110',
  surface: '#1A1A19',
  'surface-2': '#232321',
  border: '#2E2E2B',
  text: '#EDEDEB',
  muted: '#A3A29C',
  faint: '#6F6E69',
  accent: '#8D8DF0',
  'accent-soft': '#26264A',
  'on-accent': '#111110',
  danger: '#F2555A',
  success: '#3DD68C',
  warning: '#F1B43B',
};

function hexToRgbTriplet(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/** CSS variables for NativeWind's `vars()`, e.g. { '--color-bg': '250 250 249' }. */
export function cssVars(palette: Palette): Record<string, string> {
  return Object.fromEntries(
    Object.entries(palette).map(([name, hex]) => [`--color-${name}`, hexToRgbTriplet(hex)]),
  );
}

/** Client accent swatches offered when creating a client. */
export const CLIENT_COLORS = [
  '#5B5BD6',
  '#12A594',
  '#E5484D',
  '#F76B15',
  '#D6409F',
  '#0090FF',
  '#8E4EC6',
  '#978365',
] as const;
