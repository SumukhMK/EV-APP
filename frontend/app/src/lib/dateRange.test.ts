import { describe, expect, it } from 'vitest';
import { mondayOf, presets, rangeError, shiftDays, thisWeek } from './dateRange';

describe('date ranges', () => {
  it('this week runs Monday to today', () => {
    expect(thisWeek('2026-11-27')).toEqual({ from: '2026-11-23', to: '2026-11-27' });
    expect(mondayOf('2026-11-23')).toBe('2026-11-23');
    expect(mondayOf('2026-11-29')).toBe('2026-11-23'); // Sunday belongs to the week before it
  });

  it('last week is the full Monday to Sunday before this one', () => {
    const last = presets('2026-11-27').find((p) => p.key === 'last-week')!;
    expect(last.range).toEqual({ from: '2026-11-16', to: '2026-11-22' });
  });

  it('a one-day range is fine; an end before the start is not', () => {
    expect(rangeError('2026-11-27', '2026-11-27')).toBeNull();
    expect(rangeError('2026-11-27', '2026-11-26')).toBe('The end date cannot be before the start date.');
  });

  it('an incomplete or oversized range is not fetched', () => {
    expect(rangeError('', '2026-11-27')).toMatch(/both/);
    expect(rangeError('2026-11-27', '')).toMatch(/both/);
    expect(rangeError('2026-13-01', '2026-13-02')).toBe('Pick valid dates.');
    expect(rangeError(shiftDays('2026-11-27', -366), '2026-11-27')).toMatch(/year or less/);
  });
});
