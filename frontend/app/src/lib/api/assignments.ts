import type {
  AssignVehicleRequest,
  DeboardRiderRequest,
  ExchangeVehicleRequest,
  Rider,
  Vehicle,
} from '../../types';
import { riders } from '../../mocks/riders';
import { vehicles } from '../../mocks/vehicles';
import { ApiError, delay } from './client';
import { RETURN_CONDITION_NEXT_STATE } from '../labels';

/**
 * OWNER: SMK (contract + mock). The three assignment events, screens 10–12.
 *
 * Each one moves both sides — the rider's `currentVehicleId` and the bike's
 * state and rider — in a single call, because that is the invariant the
 * spreadsheet keeps breaking: a bike marked DEPLOYED with nobody on it, or a
 * rider holding a bike that is also sitting in the workshop. The rules below
 * are the ones the registry already enforces on paper. Nothing else is
 * guessed; where a rule is unknown the screen shows the field and says so.
 */

/** A bike can only leave the yard from READY_TO_DEPLOY. */
function requireDeployable(vehicleId: string, field = 'vehicleId') {
  const v = vehicles.find((x) => x.id === vehicleId);
  if (!v) throw new ApiError(`No vehicle with id ${vehicleId}`, 404, field);
  if (v.state !== 'READY_TO_DEPLOY') {
    throw new ApiError(`${v.id} is not ready to deploy`, 409, field);
  }
  return v;
}

function requireRider(riderId: string, field = 'riderId') {
  const r = riders.find((x) => x.id === riderId);
  if (!r) throw new ApiError(`No rider with id ${riderId}`, 404, field);
  if (r.status !== 'ACTIVE') {
    throw new ApiError(`${r.name} is ${r.status.toLowerCase()} and cannot hold a bike`, 409, field);
  }
  return r;
}

function open(rider: Rider, vehicle: Vehicle) {
  rider.currentVehicleId = vehicle.id;
  vehicle.state = 'DEPLOYED';
  vehicle.currentRiderId = rider.id;
  vehicle.currentRiderName = rider.name;
}

/** Closes an assignment and sends the bike where its condition says it goes. */
function close(rider: Rider, vehicle: Vehicle, condition: DeboardRiderRequest['returnCondition']) {
  rider.currentVehicleId = null;
  vehicle.state = RETURN_CONDITION_NEXT_STATE[condition];
  vehicle.currentRiderId = null;
  vehicle.currentRiderName = null;
}

/** One rider, one bike. The register's oldest rule. */
export async function assignVehicle(body: AssignVehicleRequest): Promise<Rider> {
  const rider = requireRider(body.riderId);
  if (rider.currentVehicleId) {
    throw new ApiError(
      `${rider.name} already holds ${rider.currentVehicleId}. Use Exchange vehicle instead.`,
      409,
      'riderId',
    );
  }
  const vehicle = requireDeployable(body.vehicleId);
  open(rider, vehicle);
  // `startedOn` and `note` go to the assignment record server-side.
  void body.startedOn;
  void body.note;
  return delay(rider, 420);
}

/**
 * Two events, never an overwrite: the old assignment closes with a condition
 * and the new one opens. The bike coming back takes the same route a deboarded
 * bike does, so a swap cannot quietly put a damaged bike back in the yard.
 */
export async function exchangeVehicle(body: ExchangeVehicleRequest): Promise<Rider> {
  const rider = requireRider(body.riderId);
  if (rider.currentVehicleId !== body.fromVehicleId) {
    throw new ApiError(
      `${rider.name} is not holding ${body.fromVehicleId}`,
      409,
      'fromVehicleId',
    );
  }
  if (body.toVehicleId === body.fromVehicleId) {
    throw new ApiError('Pick a different bike to exchange onto', 400, 'toVehicleId');
  }
  const from = vehicles.find((v) => v.id === body.fromVehicleId);
  if (!from) throw new ApiError(`No vehicle with id ${body.fromVehicleId}`, 404, 'fromVehicleId');
  const to = requireDeployable(body.toVehicleId, 'toVehicleId');

  close(rider, from, body.returnCondition);
  open(rider, to);
  void body.occurredOn;
  void body.reason;
  void body.note;
  return delay(rider, 460);
}

/**
 * The gate: nothing else closes an assignment. The rider comes off the active
 * register, because a rider with no bike and no plan running is not active —
 * they are re-activated by the next onboarding.
 */
export async function deboardRider(body: DeboardRiderRequest): Promise<Rider> {
  const rider = riders.find((x) => x.id === body.riderId);
  if (!rider) throw new ApiError(`No rider with id ${body.riderId}`, 404, 'riderId');
  if (rider.currentVehicleId !== body.vehicleId) {
    throw new ApiError(`${rider.name} is not holding ${body.vehicleId}`, 409, 'vehicleId');
  }
  const vehicle = vehicles.find((v) => v.id === body.vehicleId);
  if (!vehicle) throw new ApiError(`No vehicle with id ${body.vehicleId}`, 404, 'vehicleId');

  close(rider, vehicle, body.returnCondition);
  rider.status = 'INACTIVE';
  void body.returnedOn;
  void body.outstandingRent;
  void body.depositRefund;
  void body.note;
  return delay(rider, 460);
}
