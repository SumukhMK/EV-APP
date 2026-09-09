import type { Theme } from '@mui/material/styles';
import type { SystemStyleObject } from '@mui/system';

/**
 * Nocturne's motion vocabulary, in one place.
 *
 * The rule is restraint: a dark, data-dense product turns busy the moment
 * things slide around, so every motion here is small (a few pixels, a fifth of
 * a second) and every one bows out under `prefers-reduced-motion`. Screens
 * consume these rather than hand-rolling keyframes, so timings stay uniform.
 *
 * Typed as plain style objects (not `SxProps`) so a screen can either pass one
 * straight to `sx` or spread it into a larger `sx` object.
 */

const REDUCE = '@media (prefers-reduced-motion: reduce)';

/** Content arriving: fade up a few pixels. Stagger with a per-item delay. */
export function riseIn(delayMs = 0): SystemStyleObject<Theme> {
  return {
    '@keyframes owRiseIn': {
      from: { opacity: 0, transform: 'translateY(8px)' },
      to: { opacity: 1, transform: 'translateY(0)' },
    },
    animation: 'owRiseIn 340ms cubic-bezier(0.22, 1, 0.36, 1) both',
    animationDelay: `${delayMs}ms`,
    [REDUCE]: { animation: 'none' },
  };
}

/** A plain fade, for things that should not move as they appear. */
export const fadeIn: SystemStyleObject<Theme> = {
  '@keyframes owFadeIn': { from: { opacity: 0 }, to: { opacity: 1 } },
  animation: 'owFadeIn 280ms ease-out both',
  [REDUCE]: { animation: 'none' },
};

/** A gentle lift on hover, for a card or tile that leads somewhere. */
export const hoverLift: SystemStyleObject<Theme> = {
  transition: 'transform 170ms ease, background 170ms ease, border-color 170ms ease, box-shadow 170ms ease',
  '&:hover': { transform: 'translateY(-2px)' },
  [REDUCE]: { transition: 'background 170ms ease', '&:hover': { transform: 'none' } },
};

/** A nudge to the right on hover, for a list row that drills through. */
export const hoverNudge: SystemStyleObject<Theme> = {
  transition: 'transform 160ms ease, background 160ms ease',
  '&:hover': { transform: 'translateX(3px)' },
  [REDUCE]: { transition: 'background 160ms ease', '&:hover': { transform: 'none' } },
};
