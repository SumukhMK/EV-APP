import type { FormOptions } from '../../types';
import { HUBS, MODELS } from '../../mocks/seed';
import { delay } from './client';

/** The seed's lists, in the shape the live endpoint returns. */
export function getFormOptions(): Promise<FormOptions> {
  return delay({
    hubs: HUBS.map((name, i) => ({ id: `hub-${i + 1}`, name, active: true })),
    models: MODELS.map((name, i) => ({ id: `model-${i + 1}`, name, make: 'e-Connects', active: true })),
  });
}
