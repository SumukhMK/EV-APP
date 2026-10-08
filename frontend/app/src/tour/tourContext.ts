import { createContext, useContext } from 'react';
import type { TourStep } from './steps/platform';

/**
 * The tour's context and hook, apart from the provider component.
 *
 * Same reason `sessionContext.ts` is split from `session.tsx`: a module that
 * exports both a component and a value makes Fast Refresh remount the tree on
 * every edit.
 */

export interface ActiveTour {
  kind: 'platform' | 'page';
  /**
   * For a page tour, the route it belongs to. A tour outlives the navigation
   * that should have ended it otherwise — the dashboard's words stay on screen
   * while the user stands on the vehicles list. The platform tour has no path:
   * the rail is on every screen, so navigating does not invalidate it.
   */
  path?: string;
  /** Already filtered for the signed-in role, so `steps.length` is an honest total. */
  steps: TourStep[];
  index: number;
}

export interface TourValue {
  /** What is on screen now, or null when nothing is. */
  active: ActiveTour | null;
  /** The user asked to stop being shown things. The `?` menu offers to undo it. */
  muted: boolean;
  /** Whether this screen has anything to replay, so the menu can disable the offer. */
  hasPageTour: boolean;
  next: () => void;
  back: () => void;
  /** Leave early. Counts as seen. */
  skip: () => void;
  mute: () => void;
  /** Turns auto-firing back on, without replaying anything already seen. */
  unmute: () => void;
  replayPlatform: () => void;
  replayPage: () => void;
}

export const TourContext = createContext<TourValue | null>(null);

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour must be used inside TourProvider');
  return ctx;
}
