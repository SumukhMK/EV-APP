/**
 * What the tour remembers, and where.
 *
 * localStorage rather than the API, deliberately. Tour progress is a comfort,
 * not a record: the worst a lost entry can do is show a short tour a second
 * time, which is a mild annoyance and not a correctness problem. Putting it on
 * the server would mean a table, two endpoints and a migration to buy that
 * annoyance away — and would still need this file as the demo-mode fallback,
 * because demo mode has no real user to hang a row off.
 *
 * Every read and write is wrapped. A private window that refuses storage still
 * gets a working application; it simply gets the tour again next time, which is
 * the same bargain `AppLayout` makes for the rail's collapsed state.
 */

export const STORAGE_KEY = 'fleetech.tour';

/**
 * Bump when a tour's steps change enough that someone who saw the old one
 * should see the new one. A stored record from an older version reads as
 * nothing seen, so an edit here re-fires the tour for everybody rather than
 * reaching only users who happen to arrive on a fresh browser.
 */
export const TOUR_VERSION = 1;

export interface TourProgress {
  platformSeen: boolean;
  /** Route patterns whose page tour has already run, e.g. `/vehicles`. */
  pagesSeen: string[];
  /** The user asked to stop being shown things. Suppresses every auto-fire. */
  muted: boolean;
}

const NOTHING_SEEN: TourProgress = { platformSeen: false, pagesSeen: [], muted: false };

/** One record per user, so a shared demo machine does not leak one persona's progress into the next. */
type Store = Record<string, { version: number } & Partial<TourProgress>>;

function readStore(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    // A hand-edited or half-written value is not worth a crash on first paint.
    return parsed && typeof parsed === 'object' ? (parsed as Store) : {};
  } catch {
    return {};
  }
}

function writeStore(store: Store): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Quota, or a window that refuses storage. The tour still runs this session.
  }
}

export function readProgress(email: string): TourProgress {
  const record = readStore()[email];
  if (!record || record.version !== TOUR_VERSION) return NOTHING_SEEN;
  return {
    platformSeen: record.platformSeen ?? false,
    pagesSeen: record.pagesSeen ?? [],
    muted: record.muted ?? false,
  };
}

/**
 * Read-modify-write against the current record, dropping anything stored under
 * an older version — so the first write after a version bump starts clean
 * rather than resurrecting half of what `readProgress` has already disowned.
 */
function update(email: string, change: (current: TourProgress) => TourProgress): void {
  const store = readStore();
  store[email] = { version: TOUR_VERSION, ...change(readProgress(email)) };
  writeStore(store);
}

export function markPlatformSeen(email: string): void {
  update(email, (current) => ({ ...current, platformSeen: true }));
}

export function markPageSeen(email: string, path: string): void {
  update(email, (current) =>
    current.pagesSeen.includes(path) ? current : { ...current, pagesSeen: [...current.pagesSeen, path] },
  );
}

export function setMuted(email: string, muted: boolean): void {
  update(email, (current) => ({ ...current, muted }));
}
