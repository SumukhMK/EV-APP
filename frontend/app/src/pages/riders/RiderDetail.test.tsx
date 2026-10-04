import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SessionContext, type SessionValue } from '../../app/sessionContext';
import { decideKyc, getRider, listRiderPayments, reactivateRider } from '../../lib/api/riders';
import type { RiderDetail as RiderDetailRecord } from '../../types';
import { RiderDetail } from './RiderDetail';

vi.mock('../../lib/api/riders', () => ({
  getRider: vi.fn(),
  decideKyc: vi.fn(),
  reactivateRider: vi.fn(),
  listRiderPayments: vi.fn(),
}));
vi.mock('../../lib/api/vehicles', () => ({
  getVehicle: vi.fn(),
}));

const rider = vi.mocked(getRider);
const kyc = vi.mocked(decideKyc);
const payments = vi.mocked(listRiderPayments);

const pending: RiderDetailRecord = {
  id: 'R11',
  name: 'QA Rider One',
  phone: '9876500001',
  status: 'ACTIVE',
  kycStatus: 'PENDING',
  planAmount: 175000,
  depositHeld: 300000,
  billingDay: 'MONDAY',
  currentVehicleId: null,
  onboardedOn: '2026-10-04',
  paymentStatus: 'PENDING',
  platform: 'Zomato',
  paymentDay: 'MONDAY',
  paymentMode: 'UPI',
  assignments: [],
} as unknown as RiderDetailRecord;

const session = {
  user: { name: 'Meenakshi Iyer', roleKey: 'FLEET_ADMIN', email: 'meenakshi@g1mobility.in' },
  tenant: 'G1 Mobility',
  personas: [],
  signedIn: true,
  restoring: false,
  signIn: async () => {},
  signOut: () => {},
  switchPersona: () => {},
} satisfies SessionValue;

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SessionContext.Provider value={session}>
        <MemoryRouter initialEntries={['/riders/R11']}>
          <Routes>
            <Route path="/riders/:riderId" element={<RiderDetail />} />
          </Routes>
        </MemoryRouter>
      </SessionContext.Provider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  rider.mockReset();
  kyc.mockReset();
  payments.mockReset();
  payments.mockResolvedValue([]);
  vi.mocked(reactivateRider).mockReset();
});

/**
 * The decision was saved and the screen kept saying "KYC pending" until a
 * reload: the mutation invalidated the list's key, not the detail's.
 */
describe('KYC decision', () => {
  it('shows the new status without a reload', async () => {
    rider
      .mockResolvedValueOnce(pending)
      .mockResolvedValue({ ...pending, kycStatus: 'VERIFIED' });
    kyc.mockResolvedValue({ ...pending, kycStatus: 'VERIFIED' });
    show();
    const user = userEvent.setup();

    expect(await screen.findByText('KYC pending')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Verify' }));

    expect(await screen.findByText('Verified')).toBeInTheDocument();
    expect(kyc).toHaveBeenCalledWith('R11', 'VERIFIED');
    expect(rider.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
