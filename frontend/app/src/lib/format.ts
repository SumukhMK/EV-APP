import type { Paise } from '../types';

/**
 * Money, one way everywhere: whole rupees with Indian grouping ("₹1,750").
 * No paise anywhere — the API refuses them and V027 rounded the old ones, so
 * every amount is already whole and nothing is rounded here in practice.
 */
const whole = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** "1,750"; a minus sign below zero. */
export const rupees = (p: Paise) => {
  const text = whole.format(Math.round(Math.abs(p) / 100));
  return p < 0 ? `−${text}` : text;
};
/** "₹1,750", "−₹500". */
export const rupeesWithSymbol = (p: Paise) => (p < 0 ? `−₹${rupees(-p)}` : `₹${rupees(p)}`);
/** Kept as a name for the work-cost screens; the same format as everywhere else. */
export const preciseRupeesWithSymbol = rupeesWithSymbol;

const dateFmt = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });

export const formatDate = (iso: string) => dateFmt.format(new Date(iso));
export const formatDateTime = (iso: string) => `${dateFmt.format(new Date(iso))} ${timeFmt.format(new Date(iso))}`;
export const formatNumber = (n: number) => whole.format(n);

/** Whole days between an ISO timestamp and now, never negative. */
export const daysSince = (iso: string) =>
  Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
