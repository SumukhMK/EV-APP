import dayjs from 'dayjs';
import { formatDate } from './format';

export type PeriodGrain = 'DAY' | 'WEEK' | 'MONTH';

export interface ResolvedPeriod {
  grain: PeriodGrain;
  startIso: string;
  endIso: string;
  label: string;
}

/**
 * The range a grain and an anchor date actually mean.
 *
 * A plain function, kept apart from the `PeriodToggle` control, because the
 * figures on Today's Operations are filtered by this range and a screen should
 * not have to re-derive it from the toggle's props. Weeks run Wednesday to
 * Tuesday — Ashok's billing week, not the calendar's — so `startOf('week')` is
 * wrong here and would quietly mis-slice every weekly total.
 */
export function resolvePeriod(grain: PeriodGrain, anchorIso: string): ResolvedPeriod {
  const anchor = dayjs(anchorIso);

  if (grain === 'DAY') {
    const iso = anchor.format('YYYY-MM-DD');
    return { grain, startIso: iso, endIso: iso, label: formatDate(iso) };
  }

  if (grain === 'WEEK') {
    // Wednesday is day 3. Step back to the most recent Wednesday, inclusive.
    const back = (anchor.day() - 3 + 7) % 7;
    const start = anchor.subtract(back, 'day');
    const end = start.add(6, 'day');
    return {
      grain,
      startIso: start.format('YYYY-MM-DD'),
      endIso: end.format('YYYY-MM-DD'),
      label: `${formatDate(start.format('YYYY-MM-DD'))} → ${formatDate(end.format('YYYY-MM-DD'))}`,
    };
  }

  const start = anchor.startOf('month');
  const end = anchor.endOf('month');
  return {
    grain,
    startIso: start.format('YYYY-MM-DD'),
    endIso: end.format('YYYY-MM-DD'),
    label: anchor.format('MMMM YYYY'),
  };
}
