import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SessionContext, type SessionValue } from '../../app/sessionContext';
import { listOverdueRiders } from '../../lib/api/payments';
import type { OverdueRider } from '../../types';
import { OverdueRiders } from './OverdueRiders';

vi.mock('../../lib/api/payments', () => ({ listOverdueRiders: vi.fn() }));

const overdue = vi.mocked(listOverdueRiders);

function rider(i: number): OverdueRider {
  return {
    riderId: `R${String(i).padStart(2, '0')}`,
    riderName: `Rider ${String(i).padStart(2, '0')}`,
    phone: `98450${String(i).padStart(5, '0')}`,
    pastGrace: true,
    vehicleId: `BLRSS${String(4000 + i)}`,
    daysOverdue: 2 + i,
    amountDue: 170000,
    stage: 'REMINDER_DUE',
  };
}

function show() {
  const session: SessionValue = {
    user: { name: 'Meenakshi Iyer', roleKey: 'FLEET_ADMIN', email: 'meenakshi@g1mobility.in' },
    tenant: 'G1 Mobility', personas: [], signedIn: true, restoring: false,
    signIn: async () => {}, signOut: () => {}, switchPersona: () => {},
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SessionContext.Provider value={session}>
        <MemoryRouter initialEntries={['/payments/overdue']}>
          <OverdueRiders />
        </MemoryRouter>
      </SessionContext.Provider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  overdue.mockReset();
});

describe('overdue riders pagination', () => {
  it('shows twelve riders a page and pages through the rest', async () => {
    overdue.mockResolvedValue(Array.from({ length: 16 }, (_, i) => rider(i + 1)));
    const user = userEvent.setup();
    show();

    // The header action and the tiles still describe the whole list.
    expect(await screen.findByText('Showing 1–12 of 16')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remind all due (16)' })).toBeInTheDocument();
    expect(screen.getByText('Rider 01')).toBeInTheDocument();
    expect(screen.queryByText('Rider 13')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Showing 13–16 of 16')).toBeInTheDocument();
    expect(screen.getByText('Rider 13')).toBeInTheDocument();
    expect(screen.queryByText('Rider 01')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Previous' }));
    expect(screen.getByText('Showing 1–12 of 16')).toBeInTheDocument();
    expect(screen.getByText('Rider 01')).toBeInTheDocument();
  });
});