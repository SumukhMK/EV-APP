import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { listVehicles } from '../../lib/api/vehicles';
import type { Vehicle } from '../../types';
import { VehiclePicker } from './VehiclePicker';

vi.mock('../../lib/api/vehicles', () => ({ listVehicles: vi.fn() }));

const vehicles = vi.mocked(listVehicles);

function bike(id: string, hub = 'HSR'): Vehicle {
  return {
    id,
    chassisNumber: `CH-${id}`,
    model: 'Eagle-SunM',
    batteryType: 'Sun Mobility',
    batteryVendor: 'Sun Mobility',
    hub,
    state: 'READY_TO_DEPLOY',
    currentRiderId: null,
    currentRiderName: null,
    inductedOn: '2026-01-01',
    registrationNumber: null,
    odometerKm: 0,
  };
}

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <VehiclePicker value="" onChange={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vehicles.mockReset();
});

describe('VehiclePicker pagination', () => {
  it('shows twelve bikes a page and pages through the rest', async () => {
    const bikes = Array.from({ length: 22 }, (_, i) => bike(`BLRSS${String(4000 + i)}`));
    vehicles.mockResolvedValue({ content: bikes, totalElements: 22, totalPages: 1, page: 0, size: 50 } as never);
    const user = userEvent.setup();
    show();

    // First page: twelve bikes, the thirteenth not yet rendered.
    expect(await screen.findByText('Showing 1–12 of 22')).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(12);
    expect(screen.queryByText('BLRSS4012')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Showing 13–22 of 22')).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(10);
    expect(screen.getByText('BLRSS4012')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Previous' }));
    expect(screen.getByText('Showing 1–12 of 22')).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(12);
  });

  it('starts over at the first page when the hub filter changes', async () => {
    const bikes = [
      ...Array.from({ length: 14 }, (_, i) => bike(`BLRSS${String(4000 + i)}`, 'HSR')),
      ...Array.from({ length: 8 }, (_, i) => bike(`BLRSS${String(5000 + i)}`, 'KRP')),
    ];
    vehicles.mockResolvedValue({ content: bikes, totalElements: 22, totalPages: 1, page: 0, size: 50 } as never);
    const user = userEvent.setup();
    show();

    await screen.findByText('Showing 1–12 of 22');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Showing 13–22 of 22')).toBeInTheDocument();

    // Filtering to one hub lands back on that hub's first page, not a stale
    // page 2 of the unfiltered yard.
    await user.click(screen.getByRole('button', { name: /KRP 8/ }));
    expect(screen.getByText('Showing 1–8 of 8')).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(8);
  });
});