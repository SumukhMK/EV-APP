import type {
  Facet,
  OnboardRiderRequest,
  Page,
  Rider,
  RiderPaymentRow,
  RiderStatus,
} from '../../types';
import { riders } from '../../mocks/riders';
import { riderPaymentHistory } from '../../mocks/payments';
import { ApiError, delay, paginate } from './client';
import { RIDER_STATUS_LABEL } from '../labels';

/**
 * OWNER: SMK (contract + mock). Abhiram's rider screens consume this and do
 * not reach into src/mocks. If a rider screen needs a field that isn't here,
 * raise it — the field is added to the type first, then the mock.
 */

export interface RiderQuery {
  page?: number;
  size?: number;
  q?: string;
  status?: RiderStatus | 'ALL';
}

function match(r: Rider, query: RiderQuery) {
  if (query.status && query.status !== 'ALL' && r.status !== query.status) return false;
  const q = query.q?.trim().toLowerCase();
  if (!q) return true;
  return (
    r.name.toLowerCase().includes(q) ||
    r.id.toLowerCase().includes(q) ||
    r.phone.includes(q) ||
    (r.currentVehicleId ?? '').toLowerCase().includes(q)
  );
}

export async function listRiders(query: RiderQuery = {}): Promise<Page<Rider>> {
  const filtered = riders.filter((r) => match(r, query));
  return delay(paginate(filtered, query.page ?? 0, query.size ?? 12));
}

export async function riderFacets(query: Omit<RiderQuery, 'status'> = {}): Promise<Facet<RiderStatus>[]> {
  const scoped = riders.filter((r) => match(r, { ...query, status: 'ALL' }));
  const counts = new Map<RiderStatus, number>();
  for (const r of scoped) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
  const facets: Facet<RiderStatus>[] = [{ value: 'ALL', label: 'All', count: scoped.length }];
  for (const [status, count] of counts) facets.push({ value: status, label: RIDER_STATUS_LABEL[status], count });
  return delay(facets);
}

export async function getRider(id: string): Promise<Rider> {
  const r = riders.find((x) => x.id === id);
  if (!r) throw new ApiError(`No rider with id ${id}`, 404);
  return delay(r);
}

/**
 * Riders a bike can be assigned to: on the register and not already holding
 * one.
 *
 * Deliberately not filtered on KYC. Whether a bike may go out to a rider whose
 * documents are still pending is a rule nobody has stated, and guessing "no"
 * here would strand every rider the onboarding screen creates — nothing in the
 * product verifies KYC yet. The screen shows the status instead and lets the
 * person at the desk decide.
 */
export async function listAssignableRiders(): Promise<Rider[]> {
  return delay(riders.filter((r) => r.status === 'ACTIVE' && !r.currentVehicleId));
}

/** Riders an exchange or a deboard can act on: those actually holding a bike. */
export async function listAssignedRiders(): Promise<Rider[]> {
  return delay(riders.filter((r) => r.currentVehicleId !== null));
}

export async function listRiderPayments(riderId: string): Promise<RiderPaymentRow[]> {
  const r = riders.find((x) => x.id === riderId);
  if (!r) throw new ApiError(`No rider with id ${riderId}`, 404);
  return delay(riderPaymentHistory(r));
}

/**
 * A rider joins the register with no bike and KYC pending — assignment and
 * verification are separate recorded events, which is why the form offers
 * neither. Same reasoning as `createVehicle` landing a bike as INDUCTED.
 */
export async function onboardRider(body: OnboardRiderRequest): Promise<Rider> {
  const phone = body.phone.trim();
  if (riders.some((r) => r.phone === phone)) {
    throw new ApiError('A rider with this phone number is already on the register', 409, 'phone');
  }
  const created: Rider = {
    id: nextRiderId(),
    name: body.name.trim(),
    phone,
    status: 'ACTIVE',
    kycStatus: 'PENDING',
    planAmount: body.planAmount,
    billingDay: body.billingDay,
    currentVehicleId: null,
    onboardedOn: body.onboardedOn,
    paymentStatus: 'PENDING',
  };
  riders.unshift(created);
  // `depositAmount` is recorded against the rider's ledger server-side; there
  // is no deposit field on the register itself yet, so it is not invented here.
  void body.depositAmount;
  return delay(created, 420);
}

/** Rider ids are `R` plus a zero-padded counter. Continue the fixture's run. */
function nextRiderId() {
  const highest = riders.reduce((max, r) => {
    const n = Number(r.id.slice(1));
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  return `R${String(highest + 1).padStart(2, '0')}`;
}
