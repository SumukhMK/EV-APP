import { describe, expect, it } from 'vitest';
import { FLEET_MIX, vehicles } from './vehicles';
import { fleetSummary, hubUtilisation } from './dashboard';
import { bandFor } from '../theme/tokens';

/**
 * The dashboard's tiles against the artboard: 137 = 97 + 22 + 9 + 4 + 2 + 3.
 *
 * These were checked by counting pixels in a browser. The generator tops the
 * designed rows up to `FLEET_MIX` with seeded randomness, so an off-by-one in
 * that top-up is invisible to the eye and obvious here.
 */
describe('fleet fixture', () => {
  it('totals the 137 bikes the artboard shows', () => {
    expect(vehicles).toHaveLength(137);
    expect(Object.values(FLEET_MIX).reduce((a, b) => a + b, 0)).toBe(137);
  });

  it('lands every state on its designed count', () => {
    const summary = fleetSummary();
    expect(summary.totalFleet).toBe(137);
    expect(summary.deployed).toBe(97);
    expect(summary.readyToDeploy).toBe(22);
    expect(summary.underRepair).toBe(9);
    expect(summary.qcPending).toBe(4);
    expect(summary.accident).toBe(2);
    expect(summary.recovery).toBe(3);
  });

  it('accounts for every bike — the six visible states are the whole fleet', () => {
    const summary = fleetSummary();
    const parts =
      summary.deployed +
      summary.readyToDeploy +
      summary.underRepair +
      summary.qcPending +
      summary.accident +
      summary.recovery;
    expect(parts).toBe(summary.totalFleet);
  });

  it('matches the generated fleet to the declared mix, state by state', () => {
    for (const [state, count] of Object.entries(FLEET_MIX)) {
      expect(vehicles.filter((v) => v.state === state), state).toHaveLength(count);
    }
  });

  it('issues every bike a unique id and a unique chassis', () => {
    expect(new Set(vehicles.map((v) => v.id)).size).toBe(vehicles.length);
    expect(new Set(vehicles.map((v) => v.chassisNumber)).size).toBe(vehicles.length);
  });

  it('gives a rider to deployed bikes and to no others', () => {
    for (const v of vehicles) {
      if (v.state === 'DEPLOYED') expect(v.currentRiderName, v.id).toBeTruthy();
      else expect(v.currentRiderName, v.id).toBeNull();
    }
  });

  it('is stable across reads — the seed, not the clock, decides', () => {
    expect(fleetSummary()).toEqual(fleetSummary());
  });

  it('reports the overdue book as a positive figure over real rows', () => {
    const summary = fleetSummary();
    expect(summary.overdueRiders).toBeGreaterThan(0);
    expect(summary.overdueValue).toBeGreaterThan(0);
  });
});

describe('hub utilisation', () => {
  const hubs = hubUtilisation();

  it('sums back to the whole fleet', () => {
    expect(hubs.reduce((a, h) => a + h.total, 0)).toBe(vehicles.length);
    expect(hubs.reduce((a, h) => a + h.deployed, 0)).toBe(97);
  });

  it('derives idle rather than carrying a second truth', () => {
    for (const h of hubs) expect(h.idle).toBe(h.total - h.deployed);
  });

  it('keeps every percentage in range and ordered', () => {
    for (const h of hubs) {
      expect(h.percent).toBeGreaterThanOrEqual(0);
      expect(h.percent).toBeLessThanOrEqual(100);
    }
    const percents = hubs.map((h) => h.percent);
    expect([...percents].sort((a, b) => b - a)).toEqual(percents);
  });

  it('spreads the hubs across more than one band, so the panel has something to say', () => {
    // A uniform spread gave every hub the fleet-wide rate and four identical
    // bars. If that regresses, this fixture stops being a useful fixture.
    expect(new Set(hubs.map((h) => bandFor(h.percent))).size).toBeGreaterThan(1);
  });
});
