import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { getPaymentsReceived } from '../../lib/api/payments';
import { isoDay, thisWeek } from '../../lib/dateRange';
import type { TodayCollections as Received } from '../../types';
import { TodayCollections } from './TodayCollections';

vi.mock('../../lib/api/payments', () => ({ getPaymentsReceived: vi.fn() }));
const received = vi.mocked(getPaymentsReceived);

function empty(from: string, to: string): Received {
  return { date: to, from, to, total: 0, count: 0, byStaff: [], payments: [] };
}

function show(path = '/payments/today') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <TodayCollections />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const today = isoDay(new Date());
const week = thisWeek(today);

beforeEach(() => {
  received.mockReset();
  received.mockImplementation(async (from, to) => empty(from, to));
});

describe('Payments received', () => {
  it('opens on this week and asks the server for exactly that range', async () => {
    show();
    await waitFor(() => expect(received).toHaveBeenCalledWith(week.from, week.to));
    expect(screen.getByRole('button', { name: 'This week' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reset to this week' })).not.toBeInTheDocument();
  });

  it('shows totals and every payment in a picked range', async () => {
    received.mockResolvedValue({
      ...empty('2026-11-01', '2026-11-07'),
      total: 150_000,
      count: 1,
      byStaff: [{ name: 'Meenakshi Iyer', count: 1, cash: 150_000, upi: 0, bank: 0, total: 150_000 }],
      payments: [{
        id: 'p1', receiptNo: 'RCPT-2026-000001', riderId: 'R07', riderName: 'Harish Babu', vehicleId: null,
        amount: 150_000, method: 'CASH', reference: null, at: '2026-11-03T06:30:00Z', by: 'Meenakshi Iyer',
        owedBefore: 200_000, owedAfter: 50_000, reversesId: null, reason: null, reversed: false,
      }],
    });
    show('/payments/today?from=2026-11-01&to=2026-11-07');
    expect(await screen.findByText('Harish Babu')).toBeInTheDocument();
    expect(received).toHaveBeenCalledWith('2026-11-01', '2026-11-07');
    expect(screen.getAllByText('₹1,500').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Reset to this week' })).toBeInTheDocument();
  });

  it('says so when a range has no payments', async () => {
    show('/payments/today?from=2025-01-01&to=2025-01-07');
    expect((await screen.findAllByText(/No payments between/)).length).toBeGreaterThan(0);
  });

  it('an end date before the start shows an error and asks the server nothing', async () => {
    show('/payments/today?from=2026-11-10&to=2026-11-05');
    expect((await screen.findAllByText('The end date cannot be before the start date.')).length).toBeGreaterThan(0);
    expect(screen.getByLabelText('End date')).toHaveAttribute('aria-invalid', 'true');
    expect(received).not.toHaveBeenCalled();
  });

  it('picking dates in the calendars refetches, and Reset brings back this week', async () => {
    show();
    const user = userEvent.setup();
    await waitFor(() => expect(received).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-10-31' } });
    await waitFor(() => expect(received).toHaveBeenLastCalledWith('2026-10-01', '2026-10-31'));

    await user.click(screen.getByRole('button', { name: 'Reset to this week' }));
    await waitFor(() => expect(received).toHaveBeenLastCalledWith(week.from, week.to));
  });

  it('Today is one tap', async () => {
    show();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Today' }));
    await waitFor(() => expect(received).toHaveBeenLastCalledWith(today, today));
  });
});
