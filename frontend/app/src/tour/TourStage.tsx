import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Popper from '@mui/material/Popper';
import Typography from '@mui/material/Typography';
import { useAnchor } from './useAnchor';
import { useTour } from './tourContext';
import { base, mix, neutral, radius } from '../theme/tokens';
import { fadeIn } from '../theme/motion';
import { BUBBLE_WIDTH, placementFor } from './placement';
import { useTargetRect, type TargetRect } from './useTargetRect';
import { useScrollLock } from './useScrollLock';
import { Mono } from '../components/Mono';

/**
 * The tour, drawn.
 *
 * Everything with weight lives here rather than in `TourProvider`, and this
 * module is only ever reached through a `lazy()` import — so the shell's first
 * paint pays nothing for a tour that most sessions never start. The 220KB
 * budget in `scripts/size-budget.mjs` is the reason, and `npm run size` is the
 * proof.
 *
 * Two shapes, one component. A step with no target is a card in the middle of
 * the screen (the welcome); a step with one is a bubble beside it, over a
 * dimmed page with the target cut out. The cut-out is a box-shadow spread
 * rather than an SVG mask — one element, no measuring of the page, and it
 * follows the target's own border radius.
 */
/**
 * How long to wait for a target before giving up on it.
 *
 * A step that would be *dropped* gets the full patience, because dropping it is
 * destructive and a route chunk on a slow connection deserves the benefit of
 * the doubt. A step that falls back to a card has nothing to lose, and on a
 * phone every rail step is in exactly that position — nine of them, each
 * waiting a second and a half on a blank screen, is a tour that looks broken.
 */
const GRACE_MS = { skip: 1500, card: 250 };

export function TourStage() {
  const tour = useTour();
  const step = tour.active ? tour.active.steps[tour.active.index] : null;
  const anchor = useAnchor(step?.anchor ?? null, GRACE_MS[step?.onMissing ?? 'skip']);
  /**
   * Followed every frame rather than measured once. The ring used to be written
   * out as fixed coordinates taken during render, so a smooth scroll left it
   * behind — ringing "Sign out" while the bubble explained Money.
   */
  const targetRect = useTargetRect(anchor.status === 'found' ? anchor.element : null);
  const bubble = useRef<HTMLDivElement>(null);
  /**
   * State, not a ref: Popper's arrow modifier needs the node *during render* to
   * position it, and reading `ref.current` there is exactly the thing React
   * warns about. Holding it in state makes the first render without the caret
   * and the second with it, which is what the modifier expects.
   */
  const [caret, setCaret] = useState<HTMLElement | null>(null);

  const { active, next, skip } = tour;

  // The page holds still while the tour is talking — otherwise the reader can
  // scroll the target out from under its own highlight.
  useScrollLock(active !== null);

  /**
   * A target that never arrived is not worth stalling on. `useAnchor` has
   * already waited and given up by the time this fires, so the step is stepped
   * past — unless it has said its words stand on their own, in which case it
   * falls back to a centred card below rather than being dropped.
   */
  const strandedIsCard = step?.onMissing === 'card';
  useEffect(() => {
    if (anchor.status !== 'missing' || strandedIsCard) return;
    if (import.meta.env.DEV) {
      console.warn(`[tour] nothing carries data-tour="${step?.anchor}"; dropping step "${step?.id}".`);
    }
    next();
  }, [anchor.status, strandedIsCard, next, step?.anchor, step?.id]);

  // Escape leaves, from anywhere. The `?` menu is how it comes back, which is
  // what makes leaving safe to offer.
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') skip();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, skip]);

  // Focus follows the step, or a keyboard user is reading one thing and typing
  // into another.
  useEffect(() => {
    bubble.current?.focus();
  }, [active?.index]);

  if (!active || !step) return null;
  // Waiting on a chunk. Drawing an unplaced bubble first and moving it once the
  // target lands reads as a glitch, so nothing is drawn until it is placeable.
  if (anchor.status === 'waiting') return null;
  // Stranded, but worth saying anyway: shown centred, exactly like a step that
  // never wanted a target.
  const stranded = anchor.status === 'missing';
  if (stranded && !strandedIsCard) return null;

  const isLast = active.index === active.steps.length - 1;
  const isFirst = active.index === 0;

  const card = (
    <Box
      ref={bubble}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-title"
      aria-describedby="tour-body"
      sx={{
        width: { xs: 'min(88vw, 320px)', sm: BUBBLE_WIDTH },
        p: 5,
        borderRadius: radius.md,
        background: base.raised,
        border: `1px solid ${neutral[800]}`,
        boxShadow: '0 16px 40px rgba(0,0,0,0.45)',
        outline: 'none',
        ...fadeIn,
      }}
    >
      {step.title && (
        <Typography id="tour-title" sx={{ fontSize: 15, fontWeight: 600, mb: 1.5, color: base.text }}>
          {step.title}
        </Typography>
      )}
      <Typography id="tour-body" sx={{ fontSize: 13.5, lineHeight: 1.5, color: neutral[400] }}>
        {step.body}
      </Typography>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 5 }}>
        <Mono sx={{ fontSize: 11, color: neutral[600] }}>
          {active.index + 1} of {active.steps.length}
        </Mono>
        <Box sx={{ flex: 1 }} />
        <Button size="small" onClick={tour.skip} sx={{ color: neutral[500], fontSize: 12.5 }}>
          {isLast ? 'Close' : 'Skip'}
        </Button>
        {!isFirst && (
          <Button size="small" onClick={tour.back} sx={{ color: neutral[300], fontSize: 12.5 }}>
            Back
          </Button>
        )}
        <Button
          size="small"
          variant="contained"
          onClick={tour.next}
          sx={{ background: base.fill, color: base.onFill, fontSize: 12.5, '&:hover': { background: base.fill } }}
        >
          {isLast ? 'Done' : 'Next'}
        </Button>
      </Box>
    </Box>
  );

  if (anchor.status === 'none' || stranded) {
    return (
      <Box
        sx={{
          position: 'fixed',
          inset: 0,
          zIndex: 1300,
          display: 'grid',
          placeItems: 'center',
          background: 'rgba(0,0,0,0.72)',
        }}
      >
        {card}
      </Box>
    );
  }

  return (
    <>
      {targetRect && <Spotlight rect={targetRect} />}
      <Popper
        open
        anchorEl={anchor.element}
        // Beside a narrow target, underneath a wide one. `flip` alone cannot
        // save a target that spans the window, because flipping needs a side
        // with room on it — see `placement.ts`.
        placement={placementFor(
          targetRect
            ? { left: targetRect.left, right: targetRect.left + targetRect.width, width: targetRect.width }
            : anchor.element.getBoundingClientRect(),
          window.innerWidth,
        )}
        modifiers={[
          { name: 'offset', options: { offset: [0, 18] } },
          { name: 'preventOverflow', options: { padding: 12 } },
          { name: 'flip', options: { padding: 12 } },
          { name: 'arrow', options: { element: caret, padding: 12 } },
        ]}
        sx={{ zIndex: 1301 }}
      >
        <Box sx={{ position: 'relative' }}>
          {/* Without this the words and the ring are two unrelated things on a
              dark screen, and the reader has to guess which of them the bubble
              is about. */}
          <Box
            ref={setCaret}
            sx={{
              position: 'absolute',
              width: 10,
              height: 10,
              background: base.raised,
              borderTop: `1px solid ${neutral[800]}`,
              borderLeft: `1px solid ${neutral[800]}`,
              '&[data-popper-arrow]': { zIndex: 1 },
              '[data-popper-placement^="right"] &': { left: -6, transform: 'rotate(-45deg)' },
              '[data-popper-placement^="left"] &': { right: -6, transform: 'rotate(135deg)' },
              '[data-popper-placement^="bottom"] &': { top: -6, transform: 'rotate(45deg)' },
              '[data-popper-placement^="top"] &': { bottom: -6, transform: 'rotate(-135deg)' },
            }}
          />
          {card}
        </Box>
      </Popper>
    </>
  );
}

/**
 * The dim, with a hole in it.
 *
 * A huge spread shadow on a box the size of the target paints everything
 * *except* the target, which is cheaper and sharper than masking the page and
 * keeps the target's own rounding. `pointerEvents: none` so the highlight never
 * eats a click meant for the thing underneath it.
 *
 * Takes a rect rather than an element on purpose: the rect arrives from
 * `useTargetRect` and changes as the target moves, where reading it from the
 * element here would freeze it at whatever it was on the render that drew the
 * ring. That freezing was the bug.
 *
 * The treatment is louder than it was. A 1px line and a 0.55 dim is too polite
 * on a UI that is already dark — the ring has to be findable at a glance, which
 * is the whole job.
 */
function Spotlight({ rect }: { rect: TargetRect }) {
  const pad = 6;

  return (
    <Box
      aria-hidden
      sx={{
        position: 'fixed',
        zIndex: 1300,
        pointerEvents: 'none',
        top: rect.top - pad,
        left: rect.left - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
        borderRadius: radius.sm,
        boxShadow: `0 0 0 9999px rgba(0,0,0,0.72), 0 0 0 4px ${mix(base.accent, 28)}`,
        border: `2px solid ${base.accent}`,
        ...fadeIn,
      }}
    />
  );
}
