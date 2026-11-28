/**
 * Date ranges for screens that list money over days. Every value is a
 * `YYYY-MM-DD` local calendar day; the server reads them as Indian days and
 * includes both ends.
 */

/** The longest range the server accepts, in days (PaymentRunService.MAX_RANGE_DAYS). */
export const MAX_RANGE_DAYS = 366;

export function isoDay(d: Date): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function shiftDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return isoDay(d);
}

/** Monday of the week `iso` falls in. */
export function mondayOf(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return shiftDays(iso, -((d.getDay() + 6) % 7));
}

export interface DayRange {
  from: string;
  to: string;
}

/** The default view: this week, Monday to today. */
export function thisWeek(today: string): DayRange {
  return { from: mondayOf(today), to: today };
}

export function presets(today: string): { key: string; label: string; range: DayRange }[] {
  const monday = mondayOf(today);
  const yesterday = shiftDays(today, -1);
  return [
    { key: 'today', label: 'Today', range: { from: today, to: today } },
    { key: 'yesterday', label: 'Yesterday', range: { from: yesterday, to: yesterday } },
    { key: 'week', label: 'This week', range: { from: monday, to: today } },
    { key: 'last-week', label: 'Last week', range: { from: shiftDays(monday, -7), to: shiftDays(monday, -1) } },
    { key: 'month', label: 'This month', range: { from: `${today.slice(0, 8)}01`, to: today } },
  ];
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Why a range cannot be fetched, or null when it can. */
export function rangeError(from: string, to: string): string | null {
  if (!from || !to) return 'Pick both a start date and an end date.';
  if (!DAY.test(from) || !DAY.test(to) || Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) {
    return 'Pick valid dates.';
  }
  if (to < from) return 'The end date cannot be before the start date.';
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
  if (days >= MAX_RANGE_DAYS) return 'Pick a range of a year or less.';
  return null;
}
