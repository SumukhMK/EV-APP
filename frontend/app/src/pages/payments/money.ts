import type { StatusTone } from '../../theme/tokens';
import type { Paise } from '../../types';
import { formatDate, rupeesWithSymbol } from '../../lib/format';

/**
 * How every money screen words a rider's balance. One place, so "Owes ₹1,400",
 * "PAID" and "Ahead ₹500" read the same on Collections, the account page,
 * the rider profile and the collect form.
 */
/** Whole rupees: "₹1,400"; "−₹500" below zero. */
export const money = (p: Paise): string => rupeesWithSymbol(p);

/** "18 Nov – 24 Nov" for a rent line; one date when it is a single day. */
export function dayRange(from: string, to: string | null): string {
  const f = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' });
  const a = f.format(new Date(from));
  return to && to !== from ? `${a} – ${f.format(new Date(to))}` : a;
}

/** `precise` is kept for callers; every screen now shows the exact amount. */
export function owesText(owes: Paise, _precise = false): string {
  if (owes > 0) return money(owes);
  if (owes < 0) return `Ahead ${money(-owes)}`;
  return 'PAID';
}

export function owesTone(owes: Paise, daysLate: number): StatusTone {
  if (owes <= 0) return 'good';
  return daysLate > 0 ? 'bad' : 'warn';
}

/** The short tag under a balance: how late, or when this week's rent falls due. */
export function owesTag(owes: Paise, daysLate: number, dueBy: string | null): string {
  if (owes < 0) return 'Credit';
  if (owes === 0) return 'Nothing owed';
  if (daysLate > 0) return `${daysLate} ${daysLate === 1 ? 'day' : 'days'} late`;
  if (!dueBy) return 'Owes';
  const today = new Date().toISOString().slice(0, 10);
  return dueBy === today ? 'Due tonight' : `Due ${formatDate(dueBy)}`;
}

/** Rupees typed into a field, as paise. NaN for anything that is not a number. */
export function paiseFromInput(value: string): number {
  const cleaned = value.replace(/[,₹\s]/g, '');
  // Whole rupees only — no paise anywhere.
  if (!/^\d+$/.test(cleaned)) return Number.NaN;
  return Math.round(Number(cleaned) * 100);
}

/** Paise as the whole rupees a field starts with. */
export function inputFromPaise(paise: Paise): string {
  if (paise <= 0) return '';
  return String(Math.round(paise / 100));
}

/** "today, 16:31" / "21 Nov" — when a payment was taken. */
export function whenText(iso: string): string {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  const time = new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  return sameDay ? `Today ${time}` : formatDate(iso);
}

/** A fresh key per collect form, so the same form sent twice saves once. */
export function newClientKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Only a rider who owes something can be collected from — there are no advance payments. */
export function canCollectFrom(owes: Paise): boolean {
  return owes > 0;
}
