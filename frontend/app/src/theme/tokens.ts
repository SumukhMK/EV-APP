/**
 * Nocturne design tokens, lifted verbatim from the signed-off wireframe
 * (frontend/wireframe/FleeTech OS Canvas - handoff.html).
 *
 * OWNER: SMK. Do not edit to suit one screen — raise it and we change it here.
 * Screens consume these through the MUI theme, not by importing hex directly.
 * The only legitimate direct import is `status` below, which has no MUI slot.
 */

export const neutral = {
  100: '#f3f5fe',
  200: '#e4e7f5',
  300: '#cfd3e5',
  400: '#b2b6ca',
  500: '#9397ab',
  600: '#75798c',
  700: '#595d6c',
  800: '#3f424d',
  900: '#292b31',
} as const;

export const accent = {
  100: '#f5f4ff',
  200: '#e7e5fe',
  300: '#d2cefd',
  400: '#b5abfc',
  500: '#968ae0',
  600: '#796cbf',
  700: '#5d5294',
  800: '#423a6a',
  900: '#2b2741',
} as const;

export const base = {
  bg: '#161826',
  /** the canvas behind the app frame, used by the login screen */
  bgDeep: '#101120',
  surface: '#232532',
  text: '#e9e9ed',
  accent: '#9184d9',
  accent2: '#a7a1db',
  divider: 'color-mix(in srgb, #e9e9ed 16%, transparent)',
} as const;

export const radius = { sm: 4, md: 8, lg: 14 } as const;

/**
 * Status palette. Every state chip, stat tile and figure in the product draws
 * from exactly these six pairs — nothing invents a seventh colour.
 */
export type StatusTone = 'accent' | 'good' | 'caution' | 'warn' | 'bad' | 'neutral';

export const status: Record<StatusTone, { fg: string; bg: string }> = {
  accent: { fg: accent[100], bg: accent[800] },
  good: { fg: '#7ec79a', bg: '#1d2e25' },
  caution: { fg: '#dcb45f', bg: '#302a17' },
  warn: { fg: '#e09a5f', bg: '#33251a' },
  bad: { fg: '#e08585', bg: '#332022' },
  neutral: { fg: neutral[200], bg: neutral[800] },
};

export const fonts = {
  body: '"Inter", system-ui, sans-serif',
  heading: '"Inter", system-ui, sans-serif',
  mono: 'ui-monospace, Menlo, "SF Mono", monospace',
} as const;

/**
 * Shell metrics.
 *
 * The wireframe was drawn on a 1440 artboard: a 232 rail and an 1180 column.
 * That column is kept as the *reading* width for forms and prose, but the app
 * itself is not capped there — on a 1920 display an 1180 column pinned to the
 * left leaves a third of the screen empty and makes everything read small.
 * The shell grows to `contentMax` and centres in whatever is left of the rail.
 */
export const layout = {
  navWidth: 232,
  /** How wide the content column is allowed to grow before it stops. */
  contentMax: 1680,
  /** Forms and single-column reading stay near the artboard width. */
  readingMax: 900,
} as const;
