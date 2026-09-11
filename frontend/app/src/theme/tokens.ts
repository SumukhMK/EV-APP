/**
 * Nocturne Night (dark) and Saffron Day (light).
 *
 * OWNER: SMK. Do not edit to suit one screen — raise it and we change it here.
 *
 * Two schemes, one export shape. A screen still writes `neutral[900]` or
 * `status.good.fg` exactly as before, but those now resolve to CSS custom
 * properties rather than frozen hex. Flipping one attribute on <html> repaints
 * the entire app and no screen has to know which mode it is in — which is why
 * adding light mode did not mean editing forty-four files.
 *
 * The ramps are indexed by ROLE, not by lightness: 100 is always the most
 * contrasting against the page and 900 always the closest to it. In dark that
 * makes 100 near-white; in light it makes 100 near-black. That is what lets
 * `border: 1px solid ${neutral[900]}` mean "hairline" in both modes.
 */

export type StatusTone = 'accent' | 'good' | 'caution' | 'warn' | 'bad' | 'neutral';

/**
 * The intensity scale — magnitude, not state.
 *
 * `status` answers "what is this thing"; `scale` answers "how is it doing".
 * Light ranks them green → orange → yellow → red. Dark keeps green and red but
 * swaps the middle pair for Nocturne's own hues, so a dark dashboard ranks
 * identically without turning into a fruit bowl.
 *
 * Every band is separated by luminance as well as hue, so the ladder still
 * reads in greyscale and to a colour-blind operator.
 */
export type ScaleBand = 'high' | 'mid' | 'low' | 'risk';

type Ramp = Record<100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900, string>;
type Pair = { fg: string; bg: string };
type Band = Pair & { bar: string; strong: string };

interface Scheme {
  neutral: Ramp;
  accent: Ramp;
  base: {
    bg: string;
    bgDeep: string;
    surface: string;
    raised: string;
    text: string;
    accent: string;
    accent2: string;
    /** Solid action fill — orange by day, purple by night. */
    fill: string;
    onFill: string;
    divider: string;
    /** Tooltips and other surfaces that invert against the page. */
    inverseSurface: string;
    inverseText: string;
  };
  status: Record<StatusTone, Pair>;
  scale: Record<ScaleBand, Band>;
  /**
   * Data marks. Deliberately not the accent ramp: a bar is a meaningful
   * graphic and wants 3:1 against the page, which neither #FFD700 nor #FFA500
   * reaches on white — they are fills, not plot colours.
   */
  chart: { bar: string; peak: string; current: string };
}

/** Raw values. MUI's palette needs real colours; everything else uses the vars. */
export const schemes: Record<'dark' | 'light', Scheme> = {
  dark: {
    neutral: {
      100: '#f2f4fc', 200: '#dde1f2', 300: '#c3cae4', 400: '#adb6d4', 500: '#99a2c2',
      600: '#8a92b6', 700: '#4a5278', 800: '#3a4373', 900: '#2a3157',
    },
    accent: {
      100: '#f5f4ff', 200: '#e7e5fe', 300: '#c9c2ff', 400: '#b5abfc', 500: '#9184d9',
      600: '#7566c4', 700: '#4a3f86', 800: '#2a2450', 900: '#1e1a3c',
    },
    base: {
      bg: '#12152a', bgDeep: '#0c0f1f', surface: '#1b203a', raised: '#232948',
      text: '#edeff7', accent: '#b5abfc', accent2: '#c9c2ff',
      fill: '#b5abfc', onFill: '#171331',
      divider: '#2a3157', inverseSurface: '#2a3157', inverseText: '#edeff7',
    },
    status: {
      accent: { fg: '#c9c2ff', bg: '#2a2450' },
      good: { fg: '#7fd694', bg: '#14301e' },
      caution: { fg: '#ffd24a', bg: '#33280a' },
      warn: { fg: '#ffa14a', bg: '#362310' },
      bad: { fg: '#ff8a9b', bg: '#361a24' },
      neutral: { fg: '#c3cae4', bg: '#262c48' },
    },
    scale: {
      high: { fg: '#7fd694', bg: '#14301e', bar: '#4ade80', strong: '#a8e9bb' },
      mid: { fg: '#c9c2ff', bg: '#2a2450', bar: '#b5abfc', strong: '#dad5ff' },
      // #8f98b8 was the obvious grey and the wrong one: its luminance sat on
      // top of risk red, so the bottom two bands vanished into each other in
      // greyscale. Darker also reads better — "low" should recede.
      low: { fg: '#b6bdd6', bg: '#262c48', bar: '#6e7698', strong: '#d2d7e8' },
      risk: { fg: '#ff8a9b', bg: '#361a24', bar: '#f4718a', strong: '#ffb3be' },
    },
    chart: { bar: '#7566c4', peak: '#b5abfc', current: '#8a92b6' },
  },

  light: {
    neutral: {
      100: '#1a1614', 200: '#2e2a26', 300: '#44403c', 400: '#57534e', 500: '#6b6560',
      600: '#7a736c', 700: '#bdb7ae', 800: '#d8d3cb', 900: '#e5e2dd',
    },
    // Green carries every interactive label in light mode, because amber is the
    // one thing that cannot be read as small text on white without going muddy.
    accent: {
      100: '#052e16', 200: '#14532d', 300: '#166534', 400: '#15803d', 500: '#22a354',
      600: '#4ade80', 700: '#86efac', 800: '#dcfce7', 900: '#f0fdf4',
    },
    base: {
      bg: '#ffffff', bgDeep: '#ffffff', surface: '#ffffff', raised: '#fafaf9',
      text: '#1a1614', accent: '#166534', accent2: '#15803d',
      fill: '#ffa500', onFill: '#241a08',
      divider: '#e5e2dd', inverseSurface: '#2e2a26', inverseText: '#f7f5f2',
    },
    status: {
      // Deployed is the signature state, so it takes the signature colour —
      // orange by day, exactly as it takes purple by night.
      accent: { fg: '#c2410c', bg: '#ffedd5' },
      good: { fg: '#15803d', bg: '#dcfce7' },
      caution: { fg: '#a16207', bg: '#fef9c3' },
      warn: { fg: '#9a3412', bg: '#ffe4d5' },
      bad: { fg: '#be1e3c', bg: '#ffe4e9' },
      neutral: { fg: '#44403c', bg: '#f2f0ee' },
    },
    scale: {
      high: { fg: '#15803d', bg: '#dcfce7', bar: '#4ade80', strong: '#166534' },
      mid: { fg: '#c2410c', bg: '#ffedd5', bar: '#ffa500', strong: '#9a3412' },
      low: { fg: '#a16207', bg: '#fef9c3', bar: '#ffd700', strong: '#854d0e' },
      risk: { fg: '#be1e3c', bg: '#ffe4e9', bar: '#f43f5e', strong: '#9f1239' },
    },
    chart: { bar: '#d97706', peak: '#ea580c', current: '#ca8a04' },
  },
};

const RAMP_STEPS = [100, 200, 300, 400, 500, 600, 700, 800, 900] as const;
const TONES: StatusTone[] = ['accent', 'good', 'caution', 'warn', 'bad', 'neutral'];
const BANDS: ScaleBand[] = ['high', 'mid', 'low', 'risk'];

/** A scheme flattened into the custom properties the theme declares. */
export function cssVars(scheme: Scheme): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of RAMP_STEPS) {
    out[`--n-${s}`] = scheme.neutral[s];
    out[`--a-${s}`] = scheme.accent[s];
  }
  for (const [k, v] of Object.entries(scheme.base)) {
    out[`--c-${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}`] = v;
  }
  for (const t of TONES) {
    out[`--s-${t}-fg`] = scheme.status[t].fg;
    out[`--s-${t}-bg`] = scheme.status[t].bg;
  }
  for (const [k, v] of Object.entries(scheme.chart)) out[`--ch-${k}`] = v;
  for (const b of BANDS) {
    out[`--sc-${b}-fg`] = scheme.scale[b].fg;
    out[`--sc-${b}-bg`] = scheme.scale[b].bg;
    out[`--sc-${b}-bar`] = scheme.scale[b].bar;
    out[`--sc-${b}-strong`] = scheme.scale[b].strong;
  }
  return out;
}

const ramp = (prefix: string) =>
  Object.fromEntries(RAMP_STEPS.map((s) => [s, `var(--${prefix}-${s})`])) as Ramp;

export const neutral = ramp('n');
export const accent = ramp('a');

export const base = {
  bg: 'var(--c-bg)',
  bgDeep: 'var(--c-bg-deep)',
  surface: 'var(--c-surface)',
  raised: 'var(--c-raised)',
  text: 'var(--c-text)',
  accent: 'var(--c-accent)',
  accent2: 'var(--c-accent2)',
  fill: 'var(--c-fill)',
  onFill: 'var(--c-on-fill)',
  divider: 'var(--c-divider)',
  inverseSurface: 'var(--c-inverse-surface)',
  inverseText: 'var(--c-inverse-text)',
} as const;

export const status: Record<StatusTone, Pair> = Object.fromEntries(
  TONES.map((t) => [t, { fg: `var(--s-${t}-fg)`, bg: `var(--s-${t}-bg)` }]),
) as Record<StatusTone, Pair>;

export const scale: Record<ScaleBand, Band> = Object.fromEntries(
  BANDS.map((b) => [
    b,
    {
      fg: `var(--sc-${b}-fg)`,
      bg: `var(--sc-${b}-bg)`,
      bar: `var(--sc-${b}-bar)`,
      strong: `var(--sc-${b}-strong)`,
    },
  ]),
) as Record<ScaleBand, Band>;

/** Plot colours: the repeated series, its peak, and the period still running. */
export const chart = {
  bar: 'var(--ch-bar)',
  peak: 'var(--ch-peak)',
  current: 'var(--ch-current)',
} as const;

/**
 * Which band a percentage falls in. One place, so a tile and the chart it sits
 * above can never disagree about what "healthy" means.
 */
export function bandFor(percent: number): ScaleBand {
  if (percent >= 85) return 'high';
  if (percent >= 55) return 'mid';
  if (percent >= 35) return 'low';
  return 'risk';
}

/** Translucent mix of a token — `alpha()` cannot parse a `var()`. */
export const mix = (color: string, percent: number, into = 'transparent') =>
  `color-mix(in srgb, ${color} ${percent}%, ${into})`;

export const radius = { sm: 4, md: 8, lg: 14 } as const;

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
