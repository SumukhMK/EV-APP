import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SessionContext, type SessionValue } from '../../app/sessionContext';
import { getCollections, recordPayment, reversePayment } from '../../lib/api/payments';
import type { CollectionRow, Payment, UserRole } from '../../types';
import { ApiError } from '../../lib/api/client';
import { Collections } from './Collections';

vi.mock('../../lib/api/payments', () => ({
  getCollections: vi.fn(),
  recordPayment: vi.fn(),
  reversePayment: vi.fn(),
}));

const collections = vi.mocked(getCollections);
const record = vi.mocked(recordPayment);
const reverse = vi.mocked(reversePayment);

function row(over: Partial<CollectionRow>): CollectionRow {
  return {
    riderId: 'R01',
    riderName: 'Rider',
    phone: '9886001122',
    vehicleId: 'BLRSS0441',
    active: true,
    owes: 0,
    daysLate: 0,
    stage: null,
    dueBy: '2099-01-01',
    weekRent: 0,
    usualMethod: 'UPI',
    lastPayment: null,
    ...over,
  };
}

const ROWS: CollectionRow[] = [
  row({ riderId: 'R23', riderName: 'Harish Babu', owes: 500_000, daysLate: 12, stage: 'WARNING_1', usualMethod: 'CASH' }),
  row({ riderId: 'R13', riderName: 'Vikram Jadhav', owes: 140_000, vehicleId: 'FBLSS0144',
    lastPayment: { amount: 1_000_000, method: 'UPI', at: '2026-11-22T11:05:31Z', by: 'Meenakshi Iyer' } }),
  row({ riderId: 'R02', riderName: 'Raju Debnath', owes: -50_000 }),
];

function show(role: UserRole = 'FLEET_ADMIN', path = '/payments/collections') {
  const session: SessionValue = {
    user: { name: 'Meenakshi Iyer', roleKey: role, email: 'meenakshi@g1mobility.in' },
    tenant: 'G1 Mobility', personas: [], signedIn: true, restoring: false,
    signIn: async () => {}, signOut: () => {}, switchPersona: () => {},
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <SessionContext.Provider value={session}>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path]}>
          <Collections />
        </MemoryRouter>
      </QueryClientProvider>
    </SessionContext.Provider>,
  );
}

function payment(over: Partial<Payment>): Payment {
  return {
    id: 'p1', receiptNo: 'RCPT-2026-000200', riderId: 'R13', riderName: 'Vikram Jadhav', vehicleId: 'FBLSS0144',
    amount: 100_000, method: 'UPI', reference: null, at: new Date().toISOString(), by: 'Meenakshi Iyer',
    owedBefore: 140_000, owedAfter: 40_000, reversesId: null, reason: null, reversed: false, ...over,
  };
}

beforeEach(() => {
  collections.mockResolvedValue({ today: '2026-11-22', collectedToday: 1_000_000, paymentsToday: 1, rows: ROWS });
  record.mockReset();
  reverse.mockReset();
});

describe('Collections', () => {
  it('shows one number per rider: owes, old credit or PAID, with the full last payment', async () => {
    show();
    expect(await screen.findByText('Harish Babu')).toBeInTheDocument();
    expect(screen.getByText('₹5,000')).toBeInTheDocument();
    expect(screen.getByText('12 days late')).toBeInTheDocument();
    expect(screen.getByText('Ahead ₹500')).toBeInTheDocument();
    // ₹10,000 paid reads ₹10,000 — not the slice that landed on this week.
    expect(screen.getByText('₹10,000 · UPI')).toBeInTheDocument();
    // No billing day anywhere on the money screen.
    expect(screen.queryByText(/Monday|Wednesday|due$/i)).not.toBeInTheDocument();
  });

  it('finds a rider by phone, code or bike', async () => {
    show();
    const user = userEvent.setup();
    await screen.findByText('Harish Babu');
    const search = screen.getByPlaceholderText('Search name, R-code, phone or bike');

    await user.type(search, 'fblss0144');
    expect(screen.getByText('Vikram Jadhav')).toBeInTheDocument();
    expect(screen.queryByText('Harish Babu')).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, 'R23');
    expect(screen.getByText('Harish Babu')).toBeInTheDocument();
    expect(screen.queryByText('Vikram Jadhav')).not.toBeInTheDocument();
  });

  /** Late and Owes are one view now: everyone who owes, late ones first, how late shown in the Owes column. */
  it('the Owes view holds late and not-late riders, and late ones get the phone and the next step', async () => {
    // An old ?filter=late link lands on the same view.
    show('FLEET_ADMIN', '/payments/collections?filter=late');
    expect(await screen.findByText('Harish Babu')).toBeInTheDocument();
    expect(screen.getByText('Vikram Jadhav')).toBeInTheDocument();
    expect(screen.queryByText('Raju Debnath')).not.toBeInTheDocument();
    expect(screen.getByText('12 days late')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: '9886001122' })[0]).toHaveAttribute('href', 'tel:9886001122');
    expect(screen.getByText('First warning')).toBeInTheDocument();
    // Only the late rider is offered a reminder.
    expect(screen.getAllByRole('button', { name: 'Mark reminded' })).toHaveLength(1);
  });

  it('collects in two taps: amount and method start filled, one key per form, then Reverse', async () => {
    record.mockResolvedValue(payment({ riderId: 'R23', riderName: 'Harish Babu', amount: 500_000, method: 'CASH', owedBefore: 500_000, owedAfter: 0 }));
    reverse.mockResolvedValue(payment({ id: 'p2', amount: -500_000, reversesId: 'p1' }));
    show();
    const user = userEvent.setup();
    await screen.findByText('Harish Babu');

    await user.click(screen.getAllByRole('button', { name: 'Collect' })[0]);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(/Amount received/)).toHaveValue('5000');
    expect(within(dialog).getByRole('button', { name: /Cash · usual/ })).toHaveAttribute('aria-pressed', 'true');

    await user.keyboard('{Enter}');
    await waitFor(() => expect(record).toHaveBeenCalledTimes(1));
    expect(record.mock.calls[0][0]).toMatchObject({ riderId: 'R23', amount: 500_000, method: 'CASH' });
    expect(record.mock.calls[0][0].clientKey).toBeTruthy();

    expect(await screen.findByText(/₹5,000 from Harish Babu\. PAID — no dues left\./)).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Reverse' }));
    await waitFor(() => expect(reverse).toHaveBeenCalledWith('p1', 'Reversed right after collecting'));
  });

  it('refuses more than is owed: the amount shakes, says the most it can be, and nothing is sent', async () => {
    show();
    const user = userEvent.setup();
    await screen.findByText('Vikram Jadhav');
    await user.click(screen.getAllByRole('button', { name: 'Collect' })[1]);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Up to ₹1,400\. Less is fine/)).toBeInTheDocument();

    const amount = within(dialog).getByLabelText(/Amount received/);
    await user.clear(amount);
    await user.type(amount, '1400.01');
    expect(within(dialog).getByText(/No more than ₹1,400 — what Vikram Jadhav owes\. Advance payments are not taken\./)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Collect' }));
    expect(record).not.toHaveBeenCalled();

    // A part payment is fine.
    await user.clear(amount);
    await user.type(amount, '400');
    record.mockResolvedValue(payment({ amount: 40_000, owedAfter: 100_000 }));
    await user.click(within(dialog).getByRole('button', { name: 'Collect ₹400' }));
    await waitFor(() => expect(record).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/Now owes ₹1,000\./)).toBeInTheDocument();
  });

  it('a rider who owes nothing gets a disabled button that says so, and no form', async () => {
    show();
    const user = userEvent.setup();
    await screen.findByText('Raju Debnath');
    const none = screen.getByRole('button', { name: 'Collect — no outstanding dues' });
    expect(none).toBeDisabled();
    expect(none).toHaveTextContent('No dues');
    await user.click(none).catch(() => {});
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // Only the two riders who owe can be collected from.
    expect(screen.getAllByRole('button', { name: 'Collect' })).toHaveLength(2);
  });

  it('says why when the server refuses because someone else already collected', async () => {
    record.mockRejectedValue(new ApiError('Vikram Jadhav has no outstanding dues', 409, 'amount', { code: 'NO_OUTSTANDING_DUES', owes: 0 }));
    show();
    const user = userEvent.setup();
    await screen.findByText('Vikram Jadhav');
    await user.click(screen.getAllByRole('button', { name: 'Collect' })[1]);
    const dialog = await screen.findByRole('dialog');
    await user.keyboard('{Enter}');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/no outstanding dues now/);
  });

  it('never disables Collect: an empty amount shakes and says why', async () => {
    show();
    const user = userEvent.setup();
    await screen.findByText('Vikram Jadhav');
    await user.click(screen.getAllByRole('button', { name: 'Collect' })[1]);
    const dialog = await screen.findByRole('dialog');
    await user.clear(within(dialog).getByLabelText(/Amount received/));
    const save = within(dialog).getByRole('button', { name: 'Collect' });
    expect(save).toBeEnabled();
    await user.click(save);
    expect(within(dialog).getByText('Enter the amount received, above zero.')).toBeInTheDocument();
    expect(record).not.toHaveBeenCalled();
  });

  it('fleet staff do not get a Collect button', async () => {
    show('FLEET_STAFF');
    await screen.findByText('Harish Babu');
    expect(screen.queryByRole('button', { name: 'Collect' })).not.toBeInTheDocument();
  });
});
