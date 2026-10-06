import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assignVehicle, deboardRider, exchangeVehicle } from '../lib/api/assignments';
import { getRider } from '../lib/api/riders';
import type { AssignmentHistoryRow, Rider, Vehicle } from '../types';
import { riders } from './riders';
import { assignmentsByVehicle, vehicles } from './vehicles';

/**
 * The rider profile's "Bike history" panel reads nothing but the assignment
 * rows, so whatever the three assignment events fail to write simply never
 * shows up on the person's own screen.
 *
 * They used to move only the flags on the rider and the bike. Every rider
 * assigned during a session therefore read "This rider has never held a bike"
 * — and the moment one was deboarded, which is exactly when the panel is worth
 * opening, it said so about a bike that had just come back off them.
 */
describe('rider bike history', () => {
  /** A bike the register will let go of: in the yard, nobody on it. */
  function readyBike(): Vehicle {
    const v = vehicles.find((x) => x.state === 'READY_TO_DEPLOY' && !x.currentRiderId);
    if (!v) throw new Error('fixture has no Ready to Deploy bike without a rider');
    return v;
  }

  /**
   * The fixture tables are module-level and shared with the screens, and the
   * three events move the rider's flags and the bike's state along with the
   * row. Everything they touch is written back the way it was found.
   */
  let historySnapshot: string;
  const riderFlags = new Map<string, Pick<Rider, 'status' | 'currentVehicleId'>>();
  const vehicleFlags = new Map<string, Pick<Vehicle, 'state' | 'currentRiderId' | 'currentRiderName'>>();

  beforeEach(() => {
    historySnapshot = JSON.stringify(assignmentsByVehicle);
    riderFlags.clear();
    vehicleFlags.clear();
    for (const r of riders) riderFlags.set(r.id, { status: r.status, currentVehicleId: r.currentVehicleId });
    for (const v of vehicles) {
      vehicleFlags.set(v.id, { state: v.state, currentRiderId: v.currentRiderId, currentRiderName: v.currentRiderName });
    }
  });

  afterEach(() => {
    const restored = JSON.parse(historySnapshot) as typeof assignmentsByVehicle;
    for (const key of Object.keys(assignmentsByVehicle)) delete assignmentsByVehicle[key];
    Object.assign(assignmentsByVehicle, restored);

    for (const r of riders) {
      const flags = riderFlags.get(r.id);
      if (flags) Object.assign(r, flags);
    }
    for (const v of vehicles) {
      const flags = vehicleFlags.get(v.id);
      if (flags) Object.assign(v, flags);
    }
  });

  it('records the bike the moment it goes out', async () => {
    const bike = readyBike();
    await assignVehicle({ riderId: 'R02', vehicleId: bike.id, startedOn: '2026-09-01' });

    const detail = await getRider('R02');
    expect(detail.assignments).toHaveLength(1);
    expect(detail.assignments[0]).toMatchObject({
      vehicleId: bike.id,
      startedOn: '2026-09-01',
      endedOn: null,
      closedBy: null,
    });
  });

  it('keeps the row after a deboard, closed with why the bike came back', async () => {
    const bike = readyBike();
    await assignVehicle({ riderId: 'R02', vehicleId: bike.id, startedOn: '2026-09-01' });
    await deboardRider({
      riderId: 'R02',
      vehicleId: bike.id,
      returnedOn: '2026-10-01',
      returnCondition: 'NONE',
      reason: 'RECOVERED_BY_TEAM',
      nextVehicleState: 'QC_PENDING',
      outstandingRent: 0,
      depositRefund: 300_000,
      damageItems: [],
    });

    const detail = await getRider('R02');
    expect(detail.assignments).toHaveLength(1);
    expect(detail.assignments[0]).toMatchObject({
      vehicleId: bike.id,
      startedOn: '2026-09-01',
      endedOn: '2026-10-01',
      days: 30,
      reason: 'RECOVERED_BY_TEAM',
      returnCondition: 'NONE',
      closedBy: 'Fleet desk',
    });
  });

  it('leaves the previous bike on the history when one is exchanged', async () => {
    const from = readyBike();
    await assignVehicle({ riderId: 'R02', vehicleId: from.id, startedOn: '2026-09-01' });
    // A second bike, or the exchange has nothing to go on to.
    const to = readyBike();
    await exchangeVehicle({
      riderId: 'R02',
      fromVehicleId: from.id,
      toVehicleId: to.id,
      occurredOn: '2026-10-05',
      reason: 'BREAKDOWN',
      returnCondition: 'NONE',
      nextVehicleState: 'QC_PENDING',
      damageItems: [],
    });

    const detail = await getRider('R02');
    // Newest first, which is the order the panel renders in.
    expect(detail.assignments.map((a) => a.vehicleId)).toEqual([to.id, from.id]);
    expect(detail.assignments[0].endedOn).toBeNull();
    expect(detail.assignments[1]).toMatchObject({
      endedOn: '2026-10-05',
      reason: 'BREAKDOWN',
      closedBy: 'Fleet desk',
    });
  });

  it('keeps artboard 04 rows intact, re-keyed away from live riders', () => {
    // R03 holds BLRSS0428 in the fixture, and that bike's history is the one
    // artboard 04 drew. The two closed rows name riders who have left the
    // register — their ids must not collide with a live rider, or Ashwin
    // Kamath (R07) and Imran Shaikh (R11) would inherit a phantom bike.
    const rows = assignmentsByVehicle.BLRSS0428;
    expect(rows.map((a) => a.riderId)).toEqual(['R03', 'R900', 'R901']);
    expect(rows[0].endedOn).toBeNull();
    expect(rows[1].riderName).toBe('Sandeep Rathore');
    expect(rows[2].riderName).toBe('Faizal Rahman');
  });

  it('shows the open artboard row as the newest entry on R03', async () => {
    // The seeded past bikes may add rows below it, but the current bike is
    // always the first thing the panel draws.
    const detail = await getRider('R03');
    expect(detail.assignments[0]).toMatchObject({ vehicleId: 'BLRSS0428', endedOn: null });
  });
});

describe('seeded fleet history', () => {
  it('gives every rider holding a bike an open row on it', () => {
    const holders = riders.filter((r) => r.currentVehicleId);
    expect(holders.length).toBeGreaterThan(50);
    for (const r of holders) {
      const vehicleId = r.currentVehicleId!;
      const rows = assignmentsByVehicle[vehicleId] ?? [];
      const open = rows.find((a) => a.riderId === r.id && a.endedOn === null);
      expect(open, `${r.id} should have an open row on ${vehicleId}`).toBeDefined();
    }
  });

  it('gives the deboarded riders a closed history', async () => {
    for (const id of ['R05', 'R28', 'R33']) {
      const detail = await getRider(id);
      expect(detail.assignments.length, id).toBeGreaterThan(0);
      expect(detail.assignments.every((a) => a.endedOn !== null), id).toBe(true);
    }
  });

  it('never lets a rider hold two bikes at once', () => {
    const byRider = new Map<string, AssignmentHistoryRow[]>();
    for (const rows of Object.values(assignmentsByVehicle)) {
      for (const row of rows) {
        const list = byRider.get(row.riderId) ?? [];
        list.push(row);
        byRider.set(row.riderId, list);
      }
    }
    for (const [riderId, rows] of byRider) {
      const sorted = [...rows].sort((a, b) => a.startedOn.localeCompare(b.startedOn));
      for (let i = 1; i < sorted.length; i += 1) {
        const prev = sorted[i - 1];
        expect(prev.endedOn !== null && prev.endedOn < sorted[i].startedOn, `${riderId} overlaps`).toBe(true);
      }
    }
  });

  it('never double-books a bike', () => {
    for (const [vehicleId, rows] of Object.entries(assignmentsByVehicle)) {
      const sorted = [...rows].sort((a, b) => a.startedOn.localeCompare(b.startedOn));
      for (let i = 1; i < sorted.length; i += 1) {
        const prev = sorted[i - 1];
        expect(prev.endedOn !== null && prev.endedOn < sorted[i].startedOn, `${vehicleId} overlaps`).toBe(true);
      }
    }
  });

  it('leaves riders waiting for a bike without a history', () => {
    const rows = Object.values(assignmentsByVehicle).flat().filter((a) => a.riderId === 'R02');
    expect(rows).toEqual([]);
  });
});
