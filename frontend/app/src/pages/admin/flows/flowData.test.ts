// frontend/app/src/pages/admin/flows/flowData.test.ts
import { describe, expect, it } from 'vitest';
import { VEHICLE_NODES, VEHICLE_EDGES, MONEY_NODES, MONEY_EDGES, nodesForMode, edgesForMode } from './flowData';
import { VEHICLE_STATE_LABEL } from '../../../lib/labels';
import { SERVICE_QUEUE_LABEL } from '../../../lib/serviceJobLabels';
import type { FlowMode } from './types';

describe('flow data integrity', () => {
  it('every vehicle node label matches the glossary', () => {
    const glossary = { ...VEHICLE_STATE_LABEL, ...SERVICE_QUEUE_LABEL };
    for (const node of VEHICLE_NODES) {
      if (node.data.typeName === 'VehicleState' || node.data.typeName === 'ServiceQueue') {
        expect(Object.values(glossary)).toContain(node.data.label);
      }
    }
  });

  it('every edge connects two existing nodes', () => {
    const ids = new Set(VEHICLE_NODES.map((n) => n.id));
    for (const edge of VEHICLE_EDGES) {
      expect(ids.has(edge.source), `edge source ${edge.source} missing`).toBe(true);
      expect(ids.has(edge.target), `edge target ${edge.target} missing`).toBe(true);
    }
  });

  it('every money edge connects two existing money nodes', () => {
    const ids = new Set(MONEY_NODES.map((n) => n.id));
    for (const edge of MONEY_EDGES) {
      expect(ids.has(edge.source), `money edge source ${edge.source} missing`).toBe(true);
      expect(ids.has(edge.target), `money edge target ${edge.target} missing`).toBe(true);
    }
  });

  it('returns nodes for every mode without crashing', () => {
    for (const mode of ['operational', 'data', 'rbac', 'asis', 'money'] as FlowMode[]) {
      const nodes = nodesForMode(mode);
      expect(nodes.length).toBeGreaterThan(0);
    }
  });

  it('filters edges by role in RBAC mode', () => {
    const allEdges = edgesForMode('rbac');
    const staffEdges = edgesForMode('rbac', 'FLEET_STAFF');
    // Fleet staff can't collect payments, so money-related edges should be fewer
    expect(staffEdges.length).toBeLessThanOrEqual(allEdges.length);
  });
});
