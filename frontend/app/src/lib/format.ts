import type { Paise } from '../types';

/** ₹ with Indian digit grouping. Paise are dropped — Ashok bills whole rupees. */
const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

export const rupees = (p: Paise) => inr.format(Math.round(p / 100));
export const rupeesWithSymbol = (p: Paise) => `₹${rupees(p)}`;

const dateFmt = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });

export const formatDate = (iso: string) => dateFmt.format(new Date(iso));
export const formatDateTime = (iso: string) => `${dateFmt.format(new Date(iso))} ${timeFmt.format(new Date(iso))}`;
export const formatNumber = (n: number) => inr.format(n);
