import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SessionContext, type SessionValue } from '../../app/sessionContext';
import { getCurrentPaymentRun } from '../../lib/api/payments';
import { accruedRentPaise } from '../../mocks/payments';
import type { PaymentPeriodRow, PaymentRun } from '../../types';
import { PaymentRun as PaymentRunScreen } from './PaymentRun';

vi.mock('../../lib/api/payments', () => ({
  getCurrentPaymentRun: vi.fn(),
  recordPayment: vi.fn(),
}));

const run = vi.mocked(getCurrentPaymentRun);

function row(i: number): PaymentPeriodRow {
  return {
    riderId: `R${String(i).padStart(2, '0')}`,
    riderName: `Rider ${String(i).padStart(2, '0')}`,
    vehicleId: `BLRSS${String(4000 + i)}`,
    billingDay: 'THURSDAY',
    daysOverdue: 0,
    pastGrace: false,
    planAmount: 175000,
    daysBilled: 7,
    perDayAmount: 25000,
    billedAmount: 175000,
    serviceCharges: 0,
    arrears: 0,
    totalDue: 175000,
    amountPaid: 0,
    status: 'PENDING',
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
        <MemoryRouter initialEntries={['/payments/run']}>
          <PaymentRunScreen />
        </MemoryRouter>
      </SessionContext.Provider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  run.mockReset();
});

describe('payment run pagination', () => {
  it('calculates rent accrued over 15 usage days at the per-day rate', () => {
    expect(accruedRentPaise(175000, '2026-11-03', '2026-11-17')).toBe(375000);
  });

  it('shows twelve riders a page and pages through the rest', async () => {
    const data: PaymentRun = {
      periodStart: '2026-08-24',
      periodEnd: '2026-08-30',
      rows: Array.from({ length: 20 }, (_, i) => row(i + 1)),
    };
    run.mockResolvedValue(data);
    const user = userEvent.setup();
    show();

    // The totals and the panel subtitle describe the whole run, not the page.
    expect(await screen.findByText('Showing 1–12 of 20')).toBeInTheDocument();
    expect(screen.getByText(/20 riders · individual billing days/)).toBeInTheDocument();
    expect(screen.getByText('Rider 01')).toBeInTheDocument();
    expect(screen.queryByText('Rider 13')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Showing 13–20 of 20')).toBeInTheDocument();
    expect(screen.getByText('Rider 13')).toBeInTheDocument();
    expect(screen.queryByText('Rider 01')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Previous' }));
    expect(screen.getByText('Showing 1–12 of 20')).toBeInTheDocument();
    expect(screen.getByText('Rider 01')).toBeInTheDocument();
  });

});
