import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useSession } from '../app/sessionContext';
import { markPageSeen, markPlatformSeen, readProgress, setMuted } from './progress';
import { PLATFORM_STEPS, stepsForRole } from './steps/platform';
import { pageTourFor } from './steps/pages';
import { TourContext, type ActiveTour, type TourValue } from './tourContext';

/**
 * What is being shown, and when.
 *
 * Deliberately holds no UI. The provider decides which steps a user should be
 * walked through; `TourStage` draws them, and arrives lazily. That split is why
 * every rule below can be tested without a Popper in the way, and it is also
 * what keeps the first-paint budget intact: the shell pays for this file, which
 * is state and one localStorage read, and pays for the spotlight only if a tour
 * actually runs.
 *
 * Three rules govern the whole thing:
 *
 *  1. One tour at a time. A page tour never interrupts the platform tour —
 *     being taught two things at once is being taught neither.
 *  2. The platform tour comes first. Page tours stay quiet until it is done or
 *     skipped, so a brand-new user is oriented before being shown detail.
 *  3. Muting wins over everything. "Stop showing me things" means stop.
 */
export function TourProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const { pathname } = useLocation();
  const email = user.email;

  const [active, setActive] = useState<ActiveTour | null>(null);
  /**
   * Progress is mirrored in state as well as storage because every decision
   * below depends on it and storage is not reactive — a tour that finished a
   * moment ago must stop re-firing without waiting for a reload.
   */
  const [progress, setProgress] = useState(() => readProgress(email));

  /**
   * A persona switch in the demo rail changes who is signed in, and the new
   * user has their own progress — they may be owed a tour the last one had
   * seen. Adjusted during render rather than in an effect: React re-runs this
   * component before touching the DOM, so the new user never gets one frame of
   * the old user's tour, which an effect would have let through.
   */
  const [lastEmail, setLastEmail] = useState(email);
  if (lastEmail !== email) {
    setLastEmail(email);
    setProgress(readProgress(email));
    setActive(null);
  }

  const platformSteps = useMemo(() => stepsForRole(PLATFORM_STEPS, user.roleKey), [user.roleKey]);

  /**
   * Which tour, if any, this navigation is owed.
   *
   * The decision is made inside the updater rather than against `active` from
   * the closure, so "is something already running" is read from the live state
   * and the effect does not have to re-run — and therefore re-decide — every
   * time the step index moves.
   */
  /**
   * What is running, readable from an effect without making every step change
   * re-run the decision below. Written after each render rather than during
   * one, and declared above the decision effect so it is always up to date by
   * the time that effect reads it.
   */
  const activeRef = useRef<ActiveTour | null>(null);
  useEffect(() => {
    activeRef.current = active;
  });

  // The external system being synchronised with here is the router: which tour
  // is owed is a function of where the user just navigated to, which is not
  // knowable during render.
  // oxlint-disable react/set-state-in-effect
  useEffect(() => {
    const current = activeRef.current;

    /**
     * Walking away from a screen ends its tour, and counts it as seen for the
     * same reason skipping does: the user has had their chance to read it and
     * should not meet it again on every visit. The `?` menu replays it. The
     * platform tour is exempt — it is about the rail, which the user has not
     * walked away from.
     */
    if (current?.kind === 'page' && current.path !== pathname) {
      if (current.path) markPageSeen(email, current.path);
      setProgress(readProgress(email));
      setActive(null);
      // `progress` is a fresh object, so this effect runs again immediately and
      // decides what the new screen is owed with nothing in the way.
      return;
    }
    if (current) return;

    if (progress.muted) return;
    if (!progress.platformSeen) {
      setActive({ kind: 'platform', steps: platformSteps, index: 0 });
      return;
    }
    if (progress.pagesSeen.includes(pathname)) return;
    const steps = pageTourFor(pathname);
    if (steps) setActive({ kind: 'page', steps, path: pathname, index: 0 });
  }, [pathname, progress, platformSteps, email]);
  // oxlint-enable react/set-state-in-effect

  /** Records the finished tour and clears the stage. */
  const close = useCallback(
    (tour: ActiveTour) => {
      if (tour.kind === 'platform') markPlatformSeen(email);
      else markPageSeen(email, tour.path ?? pathname);
      setProgress(readProgress(email));
      setActive(null);
    },
    [email, pathname],
  );

  const next = useCallback(() => {
    setActive((current) => {
      if (!current) return null;
      if (current.index + 1 >= current.steps.length) {
        close(current);
        return null;
      }
      return { ...current, index: current.index + 1 };
    });
  }, [close]);

  const back = useCallback(() => {
    setActive((current) => (current ? { ...current, index: Math.max(0, current.index - 1) } : null));
  }, []);

  /** Leaving early still counts as seen — nobody wants the tour they dismissed. */
  const skip = useCallback(() => {
    setActive((current) => {
      if (current) close(current);
      return null;
    });
  }, [close]);

  const mute = useCallback(() => {
    setMuted(email, true);
    setProgress(readProgress(email));
    setActive(null);
  }, [email]);

  /**
   * Turns auto-firing back on without replaying anything. The user asked to see
   * tips again on screens they have not met yet, not to be walked through the
   * ones they already dismissed.
   */
  const unmute = useCallback(() => {
    setMuted(email, false);
    setProgress(readProgress(email));
  }, [email]);

  /**
   * The two below ignore `progress` entirely, and that is the point. Asking for
   * a tour is not the same as being given one: a user who muted, or who skipped
   * on their first morning and now wants it back, has to be able to get it —
   * otherwise Escape is a trap and muting is a one-way door.
   */
  const replayPlatform = useCallback(() => {
    setActive({ kind: 'platform', steps: platformSteps, index: 0 });
  }, [platformSteps]);

  const replayPage = useCallback(() => {
    const steps = pageTourFor(pathname);
    if (steps) setActive({ kind: 'page', steps, path: pathname, index: 0 });
  }, [pathname]);

  const value: TourValue = useMemo(
    () => ({
      active,
      muted: progress.muted,
      hasPageTour: pageTourFor(pathname) !== null,
      next,
      back,
      skip,
      mute,
      unmute,
      replayPlatform,
      replayPage,
    }),
    [active, progress.muted, pathname, next, back, skip, mute, unmute, replayPlatform, replayPage],
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}
