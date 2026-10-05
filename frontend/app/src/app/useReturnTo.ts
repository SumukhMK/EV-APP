import { useLocation } from 'react-router-dom';

/**
 * Where a screen should send the operator back to.
 *
 * A screen reached from another record — "End assignment" on a job page,
 * "Exchange" on a bike's page, "Deboard" on a rider's page — carries that
 * page as `state.returnTo` on the link. The target screen's back arrow,
 * Cancel and the navigation after a save all go there, so finishing one
 * step on a record lands the operator back on that record rather than on
 * a list they did not come from. A screen opened from the menu, or by URL,
 * has no returnTo and uses its own fallback.
 *
 * Only in-app paths are honoured, so a crafted state cannot send anyone
 * to another site.
 */
export function useReturnTo(fallback: string): { returnTo: string; cameFromElsewhere: boolean; backLabel: string } {
  const { state } = useLocation();
  const target: unknown = (state as { returnTo?: unknown } | null)?.returnTo;
  const valid = typeof target === 'string' && target.startsWith('/') && !target.startsWith('//');
  const returnTo = valid ? target : fallback;
  return { returnTo, cameFromElsewhere: valid, backLabel: describe(returnTo) };
}

/** "Back to job J14", "Back to BLRSS0428", "Back to R01", or plain "Back". */
export function describe(path: string): string {
  const job = /^\/service\/assistance\/([^/?#]+)/.exec(path);
  if (job && job[1] !== 'new') return `Back to job ${job[1]}`;
  const vehicle = /^\/vehicles\/([^/?#]+)/.exec(path);
  if (vehicle && vehicle[1] !== 'new') return `Back to ${vehicle[1]}`;
  const rider = /^\/riders\/([^/?#]+)/.exec(path);
  if (rider && rider[1] !== 'onboard') return `Back to ${rider[1]}`;
  if (path.startsWith('/riders')) return 'Back to riders';
  if (path.startsWith('/vehicles')) return 'Back to vehicles';
  if (path.startsWith('/service')) return 'Back to jobs';
  return 'Back';
}
