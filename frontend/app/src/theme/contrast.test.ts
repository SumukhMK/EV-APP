import { describe, expect, it } from 'vitest';
import { bandFor, cssVars, schemes, type ScaleBand, type StatusTone } from './tokens';

/**
 * The contrast sweep, ported from the browser.
 *
 * Every number in here was previously checked by eye against a picker, in one
 * scheme, on one day. That proved nothing about tomorrow. Both schemes are now
 * walked on every push, so a "nicer" hue that quietly drops a label to 3.8:1
 * turns CI red instead of shipping.
 *
 * Thresholds: 4.5:1 for text (WCAG AA), 3:1 for a bar or any other non-text
 * mark that carries meaning (WCAG 1.4.11).
 */
const TEXT_AA = 4.5;
const MARK_AA = 3;

const channel = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/** WCAG relative luminance of a `#rrggbb` token. */
function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  );
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const SCHEMES = ['dark', 'light'] as const;
const TONES: StatusTone[] = ['accent', 'good', 'caution', 'warn', 'bad', 'neutral'];
const BANDS: ScaleBand[] = ['high', 'mid', 'low', 'risk'];

describe.each(SCHEMES)('%s scheme contrast', (name) => {
  const s = schemes[name];

  it('puts body text over every surface at AA', () => {
    for (const surface of ['bg', 'bgDeep', 'surface', 'raised'] as const) {
      expect(contrast(s.base.text, s.base[surface]), `text on ${surface}`).toBeGreaterThanOrEqual(TEXT_AA);
    }
  });

  it('reads the label on a solid action fill', () => {
    expect(contrast(s.base.onFill, s.base.fill)).toBeGreaterThanOrEqual(TEXT_AA);
  });

  it('reads inverse text on the inverse surface', () => {
    expect(contrast(s.base.inverseText, s.base.inverseSurface)).toBeGreaterThanOrEqual(TEXT_AA);
  });

  it('carries the accent as text on the page', () => {
    expect(contrast(s.base.accent, s.base.bg)).toBeGreaterThanOrEqual(TEXT_AA);
    expect(contrast(s.base.accent2, s.base.surface)).toBeGreaterThanOrEqual(TEXT_AA);
  });

  it('keeps every text step of the neutral ramp readable on the page', () => {
    // 100–600 are the text steps; 700–900 are borders and tracks and are not
    // asserted here, because a hairline is not text and 4.5:1 would make it a wall.
    for (const step of [100, 200, 300, 400, 500, 600] as const) {
      expect(contrast(s.neutral[step], s.base.bg), `neutral[${step}] on page`).toBeGreaterThanOrEqual(TEXT_AA);
    }
  });

  it.each(TONES)('reads a %s status chip, and reads it on the page too', (tone) => {
    const pair = s.status[tone];
    expect(contrast(pair.fg, pair.bg), 'chip').toBeGreaterThanOrEqual(TEXT_AA);
    // A tone's foreground is also used bare on the page — a figure in PaymentRun,
    // a caption on a tile — so it has to survive both grounds.
    expect(contrast(pair.fg, s.base.bg), 'on page').toBeGreaterThanOrEqual(TEXT_AA);
    expect(contrast(pair.fg, s.base.surface), 'on card').toBeGreaterThanOrEqual(TEXT_AA);
  });

  it.each(BANDS)('reads the %s band as text and as a bar', (band) => {
    const tone = s.scale[band];
    expect(contrast(tone.fg, tone.bg), 'pill').toBeGreaterThanOrEqual(TEXT_AA);
    expect(contrast(tone.fg, s.base.bg), 'figure on page').toBeGreaterThanOrEqual(TEXT_AA);
    expect(contrast(tone.strong, s.base.bg), 'strong on page').toBeGreaterThanOrEqual(MARK_AA);
    expect(contrast(tone.bar, s.base.bg), 'bar on page').toBeGreaterThanOrEqual(MARK_AA);
    expect(contrast(tone.bar, s.base.surface), 'bar on card').toBeGreaterThanOrEqual(MARK_AA);
  });

  it('gives every band its own colour at every role', () => {
    // Colour alone never carries the band — `ScaleMeter` spells the word out
    // beside the bar — so this asserts distinctness rather than a greyscale
    // gap. Green and orange sit within ~1.15:1 of each other by luminance in
    // both schemes, and always have; claiming a greyscale ladder here would be
    // a test that passes by being wrong about the design.
    for (const role of ['fg', 'bg', 'bar', 'strong'] as const) {
      const values = BANDS.map((b) => s.scale[b][role]);
      expect(new Set(values).size, role).toBe(BANDS.length);
    }
  });

  it('keeps a band pill distinguishable from the page it sits on', () => {
    for (const b of BANDS) {
      expect(s.scale[b].bg).not.toBe(s.base.bg);
      expect(s.scale[b].bg).not.toBe(s.base.surface);
    }
  });

  it('marks the running period distinctly from every band bar', () => {
    for (const b of BANDS) {
      expect(s.chart.current).not.toBe(s.scale[b].bar);
    }
    expect(contrast(s.chart.current, s.base.bg)).toBeGreaterThanOrEqual(MARK_AA);
  });
});

describe('scheme shape', () => {
  it('declares the same custom properties in both schemes', () => {
    // A token added to one scheme and forgotten in the other resolves to
    // nothing at runtime and paints transparent. This is the cheapest place to
    // catch it.
    expect(Object.keys(cssVars(schemes.dark)).sort()).toEqual(
      Object.keys(cssVars(schemes.light)).sort(),
    );
  });

  it('emits only real colours, never an unresolved var', () => {
    for (const name of SCHEMES) {
      for (const [k, v] of Object.entries(cssVars(schemes[name]))) {
        expect(v, `${name} ${k}`).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });
});

describe('bandFor', () => {
  it('returns all four bands across the range', () => {
    expect(bandFor(100)).toBe('high');
    expect(bandFor(70)).toBe('mid');
    expect(bandFor(40)).toBe('low');
    expect(bandFor(10)).toBe('risk');
  });

  it('puts each threshold in the band above it, not below', () => {
    expect(bandFor(85)).toBe('high');
    expect(bandFor(84.9)).toBe('mid');
    expect(bandFor(55)).toBe('mid');
    expect(bandFor(54.9)).toBe('low');
    expect(bandFor(35)).toBe('low');
    expect(bandFor(34.9)).toBe('risk');
  });

  it('never leaves a percentage without a band', () => {
    for (let p = 0; p <= 100; p += 1) {
      expect(['high', 'mid', 'low', 'risk']).toContain(bandFor(p));
    }
  });
});
