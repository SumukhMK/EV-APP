import { describe, expect, it } from 'vitest';
import { resolvePeriod } from './period';

/**
 * The billing week is Ashok's, not the calendar's: Wednesday to Tuesday. This
 * is the single easiest thing in the app to get quietly wrong — `startOf('week')`
 * compiles, runs, and mis-slices every weekly total by two days — so it is the
 * first thing pinned down.
 */
describe('resolvePeriod', () => {
  it('anchors a week on the Wednesday on or before the anchor', () => {
    // 2026-09-12 is a Saturday; the week it belongs to opened on Wednesday the 9th.
    const week = resolvePeriod('WEEK', '2026-09-12');
    expect(week.startIso).toBe('2026-09-09');
    expect(week.endIso).toBe('2026-09-15');
  });

  it('treats a Wednesday as the first day of its own week, not the last of the previous', () => {
    const week = resolvePeriod('WEEK', '2026-09-09');
    expect(week.startIso).toBe('2026-09-09');
    expect(week.endIso).toBe('2026-09-15');
  });

  it('treats a Tuesday as the last day of the week that opened six days earlier', () => {
    const week = resolvePeriod('WEEK', '2026-09-15');
    expect(week.startIso).toBe('2026-09-09');
    expect(week.endIso).toBe('2026-09-15');
  });

  it('never uses the calendar week — Sunday and Monday still fall back to Wednesday', () => {
    expect(resolvePeriod('WEEK', '2026-09-13').startIso).toBe('2026-09-09'); // Sunday
    expect(resolvePeriod('WEEK', '2026-09-14').startIso).toBe('2026-09-09'); // Monday
  });

  it('crosses a month boundary without clamping', () => {
    // Thursday 1 Oct 2026 belongs to the week that opened Wednesday 30 September.
    const week = resolvePeriod('WEEK', '2026-10-01');
    expect(week.startIso).toBe('2026-09-30');
    expect(week.endIso).toBe('2026-10-06');
  });

  it('always spans exactly seven days', () => {
    for (let d = 1; d <= 28; d += 1) {
      const iso = `2026-09-${String(d).padStart(2, '0')}`;
      const { startIso, endIso } = resolvePeriod('WEEK', iso);
      const days = (Date.parse(endIso) - Date.parse(startIso)) / 86_400_000;
      expect(days).toBe(6);
      expect(new Date(`${startIso}T00:00:00Z`).getUTCDay()).toBe(3); // Wednesday
    }
  });

  it('resolves a day to itself', () => {
    const day = resolvePeriod('DAY', '2026-09-12');
    expect(day.startIso).toBe('2026-09-12');
    expect(day.endIso).toBe('2026-09-12');
  });

  it('resolves a month to its calendar bounds', () => {
    const month = resolvePeriod('MONTH', '2026-09-12');
    expect(month.startIso).toBe('2026-09-01');
    expect(month.endIso).toBe('2026-09-30');
    expect(month.label).toBe('September 2026');
  });
});
