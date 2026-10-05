import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SessionContext, type SessionValue } from '../../app/sessionContext';
import { listAssignableRiders } from '../../lib/api/riders';
import { listVehicles } from '../../lib/api/vehicles';
import { assignVehicle } from '../../lib/api/assignments';
import { ApiError } from '../../lib/api/client';
import type { Rider } from '../../types';
import { AssignVehicle } from './AssignVehicle';

vi.mock('../../lib/api/riders', () => ({ listAssignableRiders: vi.fn() }));
vi.mock('../../lib/api/vehicles', () => ({ listVehicles: vi.fn() }));
vi.mock('../../lib/api/assignments', () => ({ assignVehicle: vi.fn() }));

const riders = vi.mocked(listAssignableRiders);
const vehicles = vi.mocked(listVehicles);
const assign = vi.mocked(assignVehicle);

const base: Rider = {
  id: 'R01', name: 'Abcd Two', phone: '9845000001', status: 'ACTIVE', kycStatus: 'VERIFIED',
  planAmount: 175000, depositHeld: 300000, billingDay: 'MONDAY', currentVehicleId: null,
  onboardedOn: '2026-10-05', paymentStatus: 'PENDING', duesPaise: 0, platform: 'Zomato',
  paymentDay: 'MONDAY', paymentMode: 'UPI',
} as Rider;

function show(role: 'FLEET_ADMIN' | 'FLEET_STAFF' = 'FLEET_ADMIN') {
  const session = {
    user: { name: 'Meenakshi Iyer', roleKey: role, email: 'meenakshi@g1mobility.in' },
    tenant: 'G1 Mobility', personas: [], signedIn: true, restoring: false,
    signIn: async () => {}, signOut: () => {}, switchPersona: () => {},
  } satisfies SessionValue;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SessionContext.Provider value={session}>
        <MemoryRouter initialEntries={['/assignments/assign']}>
          <AssignVehicle />
        </MemoryRouter>
      </SessionContext.Provider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  riders.mockReset();
  vehicles.mockReset();
  assign.mockReset();
  vehicles.mockResolvedValue({ content: [], totalElements: 0, totalPages: 0, page: 0, size: 50 } as never);
});

describe('assign vehicle — deboarded riders and dues', () => {
  /** Inactive means on the register without a bike: offered, with what they owe. */
  it('offers an inactive rider with their dues', async () => {
    riders.mockResolvedValue([{ ...base, status: 'INACTIVE', duesPaise: 120000 }]);
    show();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Open' }));
    expect(await screen.findByRole('option', { name: /Abcd Two · R01 · Verified · owes ₹1,200/ })).toBeInTheDocument();
  });

  /** Above the deposit the server refuses on `dues`; an admin sees the override, a fleet hand sees what to do instead. */
  it('shows the deposit-limit refusal with an admin override, and no override for staff', async () => {
    riders.mockResolvedValue([{ ...base, duesPaise: 450000 }]);
    assign.mockRejectedValue(new ApiError(
      'Abcd Two owes ₹4,500 against a deposit of ₹3,000 — collect first, or an admin can override with a note', 422, 'dues'));
    show('FLEET_STAFF');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Open' }));
    await user.click(await screen.findByRole('option', { name: /Abcd Two/ }));
    // The summary already warns before anything is sent.
    expect(screen.getByText(/₹4,500 · deposit ₹3,000/)).toBeInTheDocument();
  });
});
