import type { Vehicle } from '../../types';
import { vehicles } from '../../mocks/vehicles';
import { serviceJobs } from '../../mocks/serviceJobs';
import { delay } from './client';


/** An assigned bike can visit service without ending its rider assignment. */
export async function listInspectableVehicles(): Promise<Vehicle[]> {
  return delay(
    vehicles.filter((v) => v.state !== 'RETIRED'),
  );
}

export async function getVehicleServiceHistory(vehicleId: string) {
  return delay(serviceJobs.filter((job) => job.vehicleId === vehicleId).map((job) => ({ ...job })));
}
