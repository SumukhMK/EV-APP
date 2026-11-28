import { ApiError } from '../lib/api/client';
import dayjs from 'dayjs';
import type {
  AccountLine,
  BillingDay,
  CollectionRow,
  Collections,
  DunningStage,
  Payment,
  PaymentMethod,
  RecordPaymentRequest,
  Rider,
  RiderAccount,
  StaffTotal,
  TodayCollections,
} from '../types';
import { riders } from './riders';
import { riderCharges } from './riderCharges';

/**
 * Demo-mode money: a small in-memory ledger shaped like the real one.
 *
 * Same rule as the API — owes = rent + open rider charges − payments — and
 * payments are one row each, covering the oldest week first. Rent runs for the
 * last few weeks (earlier weeks count as settled, as on the server); the
 * seeded payments follow each fixture rider's payment status so the screens
 * have late, part-paid and paid-up riders to show.
 */

const DAYS: BillingDay[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const WEEKS_SHOWN = 5;
const STAFF = ['Meenakshi Iyer', 'Priya Menon'];

interface MockPayment extends Payment {
  riderKey: string;
  clientKey?: string;
}

const iso = (d: dayjs.Dayjs) => d.format('YYYY-MM-DD');
const today = () => dayjs().startOf('day');

/** The most recent billing day on or before `date`. */
function weekStart(day: BillingDay, date: dayjs.Dayjs): dayjs.Dayjs {
  const target = DAYS.indexOf(day) + 1; // 1 = Monday, like isoWeekday
  const dow = date.day() === 0 ? 7 : date.day();
  return date.subtract((dow - target + 7) % 7, 'day');
}

interface RentWeek {
  start: dayjs.Dayjs;
  end: dayjs.Dayjs; // last day covered so far
  weekEnd: dayjs.Dayjs; // last day of the billing week
  days: number;
  rent: number;
}

function rentWeeks(rider: Rider): RentWeek[] {
  if (!rider.currentVehicleId) return [];
  // Same rule as RiderAccounts.perDay: a seventh of the plan, to the nearest whole rupee.
  const perDay = Math.round(rider.planAmount / 700) * 100;
  const now = today();
  const current = weekStart(rider.billingDay, now);
  const onboarded = dayjs(rider.onboardedOn);
  const out: RentWeek[] = [];
  for (let w = WEEKS_SHOWN; w >= 0; w--) {
    const start = current.subtract(w, 'week');
    const weekEnd = start.add(6, 'day');
    const from = onboarded.isAfter(start) ? onboarded : start;
    const to = weekEnd.isAfter(now) ? now : weekEnd;
    if (from.isAfter(to)) continue;
    const days = to.diff(from, 'day') + 1;
    out.push({ start: from, end: to, weekEnd, days, rent: days === 7 ? rider.planAmount : days * perDay });
  }
  return out;
}

const payments: MockPayment[] = [];
let seeded = false;
let nextPayment = 1;
let nextReceipt = 120;

function newPayment(rider: Rider, amount: number, method: PaymentMethod, at: dayjs.Dayjs, by: string,
                    owedBefore: number | null, extra: Partial<Payment> = {}): MockPayment {
  return {
    id: `PAY-${String(nextPayment++).padStart(5, '0')}`,
    receiptNo: amount > 0 ? `RCPT-${at.year()}-${String(nextReceipt++).padStart(6, '0')}` : null,
    riderId: rider.id,
    riderName: rider.name,
    vehicleId: rider.currentVehicleId,
    amount,
    method,
    reference: method === 'UPI' && amount > 0 ? `UPI${String(400000000 + nextPayment * 7919).slice(0, 9)}` : null,
    at: at.toISOString(),
    by,
    owedBefore,
    owedAfter: owedBefore === null ? null : owedBefore - amount,
    reversesId: null,
    reason: null,
    reversed: false,
    riderKey: rider.id,
    ...extra,
  };
}

/** Payments the fixture riders made before today, following their payment status. */
function seed() {
  if (seeded) return;
  seeded = true;
  riders.forEach((rider, i) => {
    const weeks = rentWeeks(rider);
    if (weeks.length === 0) return;
    const lateWeeks = rider.paymentStatus === 'OVERDUE' ? 1 + (i % 3) : 0;
    weeks.forEach((w, idx) => {
      const isCurrent = idx === weeks.length - 1;
      const by = STAFF[i % STAFF.length];
      if (isCurrent) {
        if (rider.paymentStatus === 'PAID') payments.push(newPayment(rider, w.rent, rider.paymentMode, w.end.hour(10), by, null));
        if (rider.paymentStatus === 'PARTIAL') payments.push(newPayment(rider, Math.round(w.rent * 0.6), rider.paymentMode, w.end.hour(10), by, null));
        return;
      }
      if (idx >= weeks.length - 1 - lateWeeks) return; // the unpaid late weeks
      payments.push(newPayment(rider, w.rent, rider.paymentMode, w.weekEnd.hour(18), by, null));
    });
  });
}

function riderById(id: string): Rider | undefined {
  return riders.find((r) => r.id === id);
}

function openCharges(riderId: string) {
  return riderCharges.filter((c) => c.riderId === riderId && c.liability === 'RIDER' && c.status === 'OPEN');
}

function stageFor(days: number): DunningStage {
  if (days >= 21) return 'REPOSSESSION_DUE';
  if (days >= 14) return 'WARNING_2';
  if (days >= 7) return 'WARNING_1';
  return 'REMINDER_DUE';
}

/** The same account the API builds: lines oldest first, rent paid oldest week first. */
function accountOf(rider: Rider): RiderAccount {
  seed();
  const weeks = rentWeeks(rider);
  const charges = openCharges(rider.id);
  const paid = payments.filter((p) => p.riderKey === rider.id);
  const reversedIds = new Set(paid.filter((p) => p.reversesId).map((p) => p.reversesId));

  type Item = { at: string; order: number; line: Omit<AccountLine, 'balance'> };
  const items: Item[] = [
    ...weeks.map<Item>((w) => ({
      at: w.start.toISOString(),
      order: 0,
      line: {
        kind: 'RENT', date: iso(w.start), at: w.start.toISOString(), amount: w.rent, to: iso(w.end), days: w.days,
        locked: !w.weekEnd.isAfter(today()), note: null, paymentId: null, receiptNo: null, method: null,
        reference: null, by: null, reason: null, reversed: false, canReverse: false, reverseBlock: null, needsDetailedReason: false, receiptIssuedAt: null,
      },
    })),
    ...charges.map<Item>((c) => ({
      at: dayjs(c.createdOn).toISOString(),
      order: 1,
      line: {
        kind: 'CHARGE', date: c.createdOn, at: dayjs(c.createdOn).toISOString(), amount: c.amount, to: null, days: 0,
        locked: false, note: 'Repair', paymentId: null, receiptNo: null, method: null, reference: null, by: null,
        reason: null, reversed: false, canReverse: false, reverseBlock: null, needsDetailedReason: false, receiptIssuedAt: null,
      },
    })),
    ...paid.map<Item>((p) => ({
      at: p.at,
      order: 2,
      line: {
        kind: p.reversesId ? 'REVERSAL' : 'PAYMENT', date: p.at.slice(0, 10), at: p.at, amount: -p.amount, to: null,
        days: 0, locked: false, note: null, paymentId: p.id, receiptNo: p.receiptNo, method: p.method,
        reference: p.reference, by: p.by, reason: p.reason, reversed: reversedIds.has(p.id),
        // The demo signs in as an admin: any payment not yet reversed.
        canReverse: !p.reversesId && !reversedIds.has(p.id), reverseBlock: null,
        needsDetailedReason: false, receiptIssuedAt: null,
      },
    })),
  ];
  items.sort((a, b) => a.line.date.localeCompare(b.line.date) || a.order - b.order || a.at.localeCompare(b.at));

  let balance = 0;
  const lines = items.map<AccountLine>((i) => {
    balance += i.line.amount;
    return { ...i.line, balance };
  });

  const rent = weeks.reduce((t, w) => t + w.rent, 0);
  const chargeTotal = charges.reduce((t, c) => t + c.amount, 0);
  const paidTotal = paid.reduce((t, p) => t + p.amount, 0);
  const owes = rent + chargeTotal - paidTotal;

  let left = paidTotal;
  let lateSince: string | null = null;
  let daysLate = 0;
  for (const w of weeks) {
    if (left >= w.rent) {
      left -= w.rent;
      continue;
    }
    const late = today().diff(w.weekEnd, 'day');
    if (late > 0 && owes > 0) {
      daysLate = late;
      lateSince = iso(w.weekEnd);
    }
    break;
  }

  return {
    riderId: rider.id,
    riderName: rider.name,
    phone: rider.phone,
    vehicleId: rider.currentVehicleId,
    active: rider.status === 'ACTIVE',
    planAmount: rider.planAmount,
    perDayAmount: Math.round(rider.planAmount / 700) * 100,
    depositHeld: rider.depositHeld,
    usualMethod: rider.paymentMode,
    owes,
    daysLate,
    lateSince,
    stage: daysLate > 0 ? stageFor(daysLate) : null,
    rentFrom: weeks.length ? iso(weeks[0].start) : null,
    rent,
    charges: chargeTotal,
    paid: paidTotal,
    lines: lines.reverse(),
  };
}

function rowOf(rider: Rider): CollectionRow {
  const a = accountOf(rider);
  const last = payments
    .filter((p) => p.riderKey === rider.id && !p.reversesId && !a.lines.some((l) => l.paymentId === p.id && l.reversed))
    .at(-1);
  const weeks = rentWeeks(rider);
  const current = weeks.at(-1);
  return {
    riderId: rider.id,
    riderName: rider.name,
    phone: rider.phone,
    vehicleId: rider.currentVehicleId,
    active: rider.status === 'ACTIVE',
    owes: a.owes,
    daysLate: a.daysLate,
    stage: a.stage,
    dueBy: current ? iso(current.weekEnd) : null,
    weekRent: current && !current.weekEnd.isBefore(today()) ? current.rent : 0,
    usualMethod: rider.paymentMode,
    lastPayment: last ? { amount: last.amount, method: last.method, at: last.at, by: last.by } : null,
  };
}

function todays(date: string) {
  return between(date, date);
}

/** Both days included, by the local calendar day a payment was taken on. */
function between(from: string, to: string) {
  return payments.filter((p) => {
    const day = dayjs(p.at).format('YYYY-MM-DD');
    return day >= from && day <= to;
  });
}

function strip(p: MockPayment): Payment {
  const { riderKey: _rider, clientKey: _key, ...rest } = p;
  return { ...rest, reversed: payments.some((r) => r.reversesId === p.id) };
}

export function collections(): Collections {
  seed();
  const rows = riders
    .filter((r) => r.status === 'ACTIVE' || accountOf(r).owes !== 0)
    .map(rowOf)
    .sort((a, b) => b.daysLate - a.daysLate || b.owes - a.owes || a.riderName.localeCompare(b.riderName));
  const day = todays(iso(today()));
  return {
    today: iso(today()),
    collectedToday: day.reduce((t, p) => t + p.amount, 0),
    paymentsToday: day.filter((p) => !p.reversesId).length,
    rows,
  };
}

export function riderAccount(riderId: string): RiderAccount | null {
  const rider = riderById(riderId);
  return rider ? accountOf(rider) : null;
}

export function recordPayment(req: RecordPaymentRequest): Payment {
  seed();
  if (req.clientKey) {
    const existing = payments.find((p) => p.clientKey === req.clientKey);
    if (existing) return strip(existing);
  }
  const rider = riderById(req.riderId);
  if (!rider) throw new Error(`No rider ${req.riderId}`);
  // The same three rules, and the same codes, as PaymentRunService.record.
  if (!(req.amount > 0)) {
    throw new ApiError('A payment must be more than zero', 422, 'amount', { code: 'INVALID_PAYMENT_AMOUNT' });
  }
  const owedBefore = accountOf(rider).owes;
  if (owedBefore <= 0) {
    throw new ApiError(`${rider.name} has no outstanding dues`, 409, 'amount', { code: 'NO_OUTSTANDING_DUES', owes: owedBefore });
  }
  if (req.amount > owedBefore) {
    throw new ApiError('That is more than the rider owes. Advance payments are not taken.', 422, 'amount', {
      code: 'PAYMENT_EXCEEDS_DUES',
      owes: owedBefore,
    });
  }
  const p = newPayment(rider, req.amount, req.method, dayjs(), 'You', owedBefore, {
    reference: req.reference?.trim() || null,
  });
  p.clientKey = req.clientKey;
  payments.push(p);
  return strip(p);
}

export function reversePayment(paymentId: string, reason: string): Payment {
  seed();
  const original = payments.find((p) => p.id === paymentId);
  if (!original) throw new Error('No such payment');
  if (original.reversesId) throw new Error('A reversal cannot be reversed');
  if (payments.some((p) => p.reversesId === paymentId)) throw new Error('This payment was already reversed');
  const rider = riderById(original.riderKey)!;
  const owedBefore = accountOf(rider).owes;
  const p = newPayment(rider, -original.amount, original.method, dayjs(), 'You', owedBefore, {
    reversesId: paymentId,
    reason: reason.trim(),
    reference: null,
  });
  payments.push(p);
  return strip(p);
}

export function paymentById(paymentId: string): Payment | null {
  seed();
  const p = payments.find((x) => x.id === paymentId);
  return p ? strip(p) : null;
}

export function received(from: string, to: string): TodayCollections {
  seed();
  if (to < from) throw new ApiError('The end date cannot be before the start date', 422, 'to', { code: 'INVALID_DATE_RANGE' });
  const day = between(from, to).slice().sort((a, b) => b.at.localeCompare(a.at));
  const staff = new Map<string, StaffTotal>();
  for (const p of day) {
    const owner = p.reversesId ? payments.find((o) => o.id === p.reversesId)?.by ?? p.by : p.by;
    const name = owner ?? 'Unknown';
    const t = staff.get(name) ?? { name, count: 0, cash: 0, upi: 0, bank: 0, total: 0 };
    if (!p.reversesId) t.count++;
    if (p.method === 'CASH') t.cash += p.amount;
    if (p.method === 'UPI') t.upi += p.amount;
    if (p.method === 'BANK_TRANSFER') t.bank += p.amount;
    t.total += p.amount;
    staff.set(name, t);
  }
  return {
    date: to,
    from,
    to,
    total: day.reduce((t, p) => t + p.amount, 0),
    count: day.filter((p) => !p.reversesId).length,
    byStaff: [...staff.values()],
    payments: day.map(strip),
  };
}

/** The dashboard's two money tiles: late riders and what they owe. */
export function lateSummary(): { riders: number; value: number } {
  const late = collections().rows.filter((r) => r.active && r.daysLate > 0 && r.owes > 0);
  return { riders: late.length, value: late.reduce((t, r) => t + r.owes, 0) };
}
