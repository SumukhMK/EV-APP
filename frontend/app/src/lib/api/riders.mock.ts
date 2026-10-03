import type {
  Facet,
  OnboardRiderRequest,
  Page,
  Platform,
  Rider,
  RiderPaymentRow,
  RiderStatus,
  VehicleState,
  RiderDetail,
  RiderAssignmentRow,
} from '../../types';
import { riders } from '../../mocks/riders';
import { assignmentsByVehicle, vehicles } from '../../mocks/vehicles';
import { riderPaymentHistory } from '../../mocks/payments';
import { ApiError, delay, paginate } from './client';
import { RIDER_STATUS_LABEL } from '../labels';

/**
 * OWNER: SMK (contract + mock). Abhiram's rider screens consume this and do
 * not reach into src/mocks. If a rider screen needs a field that isn't here,
 * raise it — the field is added to the type first, then the mock.
 *
 * Mock half of the S2 module — riders.ts picks between this and riders.live.
 */

export interface RiderQuery {
  page?: number;
  size?: number;
  q?: string;
  status?: RiderStatus | 'ALL';
  platform?: Platform | 'ALL';
  vehicleState?: VehicleState | 'ALL';
}

function match(r: Rider, query: RiderQuery) {
  if (query.status && query.status !== 'ALL' && r.status !== query.status) return false;
  if (query.platform && query.platform !== 'ALL' && r.platform !== query.platform) return false;
  if (query.vehicleState && query.vehicleState !== 'ALL') {
    const vs = vehicles.find((v) => v.id === r.currentVehicleId)?.state;
    if (vs !== query.vehicleState) return false;
  }
  const q = query.q?.trim().toLowerCase();
  if (!q) return true;
  // Everything on the row is searchable, including the platform — the same
  // reason the vehicle search matches its hub.
  return (
    r.name.toLowerCase().includes(q) ||
    r.id.toLowerCase().includes(q) ||
    r.phone.includes(q) ||
    (r.platform ?? '').toLowerCase().includes(q) ||
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

/** Records the KYC decision. */
export async function decideKyc(id: string, decision: 'VERIFIED' | 'REJECTED'): Promise<Rider> {
  const rider = riders.find((r) => r.id === id);
  if (!rider) throw new ApiError('Rider not found', 404);
  rider.kycStatus = decision;
  return delay({ ...rider }, 300);
}

/** Puts a deboarded rider back on the active register. */
export async function reactivateRider(id: string): Promise<Rider> {
  const rider = riders.find((r) => r.id === id);
  if (!rider) throw new ApiError('Rider not found', 404);
  if (rider.status === 'BLACKLISTED') {
    throw new ApiError(`${rider.name} is blacklisted and cannot be put back on the register`, 409);
  }
  rider.status = 'ACTIVE';
  return delay({ ...rider }, 300);
}

export async function getRider(id: string): Promise<RiderDetail> {
  const r = riders.find((x) => x.id === id);
  if (!r) throw new ApiError(`No rider with id ${id}`, 404);
  // The fixture keeps assignment history keyed by bike, because that is the
  // screen it was written for. Turning it round here keeps one source of
  // truth rather than a second list that can disagree with the first.
  const assignments: RiderAssignmentRow[] = Object.entries(assignmentsByVehicle)
    .flatMap(([vehicleId, rows]) =>
      rows
        .filter((a) => a.riderId === id)
        .map((a) => ({
          vehicleId,
          startedOn: a.startedOn,
          endedOn: a.endedOn,
          days: a.days,
          reason: null,
          returnCondition: null,
          closedBy: a.closedBy,
        })),
    )
    .sort((a, b) => b.startedOn.localeCompare(a.startedOn));
  // The fixture predates these fields, so a mock rider has none. The screen
  // renders a dash, which is what a rider onboarded before V012 shows live.
  return delay({ ...r, assignments });
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
    depositHeld: body.depositPlan,
    billingDay: body.billingDay,
    currentVehicleId: null,
    onboardedOn: body.onboardedOn,
    paymentStatus: 'PENDING',
    platform: (body.workingPlatform as Platform) || 'Other',
    paymentDay: body.paymentDay,
    paymentMode: body.paymentMode,
  };
  riders.unshift(created);
  // `depositPaid` is recorded against the rider's ledger server-side; the
  // register holds the deposit plan, which is what a deboard settles against.
  void body.depositPaid;
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
