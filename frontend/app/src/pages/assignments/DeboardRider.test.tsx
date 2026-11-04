import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { DeboardRider } from './DeboardRider';
import { deboardRider } from '../../lib/api/assignments';
import { listAssignedRiders, listRiderPayments } from '../../lib/api/riders';

vi.mock('../../lib/api/assignments', async (original) => ({
  ...(await original<typeof import('../../lib/api/assignments')>()),
  deboardRider: vi.fn(),
}));

function show(path = '/assignments/deboard') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <DeboardRider />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('deboard settlement', () => {
  /** Nothing about the return can be filled in before the rider is known: the panels are inert and say why. */
  it('locks the return, money and confirmation panels until a rider is picked', async () => {
    show();
    const rent = await screen.findByRole('spinbutton', { name: 'Rent still owed (₹)' });
    expect(rent.closest('[inert]')).not.toBeNull();
    expect(screen.getAllByRole('note', { name: '' }).map((n) => n.textContent)).toEqual(
      expect.arrayContaining(['Pick the rider first']),
    );
    expect(screen.getAllByText('Pick the rider first')).toHaveLength(3);
  });

  it('settles the rent but never asks the desk to guess a damage deduction', async () => {
    show();
    const user = userEvent.setup();
    expect(await screen.findByRole('spinbutton', { name: 'Rent still owed (₹)' })).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: 'Deposit being returned (₹)' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Deposit left after rent owed').length).toBeGreaterThan(0);
    // The damage guidance lives behind the (i) on the Money panel now.
    const moneyLabel = screen.getByText('Money', { selector: '.MuiTypography-overline' });
    await user.hover(within(moneyLabel).getByRole('img', { name: /Only the rent is settled here/ }));
    expect(await screen.findByText(/decided on the service job/)).toBeInTheDocument();
  });

  /** What the dialog quotes is what goes on the wire: refund = deposit held − rent typed. */
  it('starts at the recorded rent and refunds the deposit less what was typed', async () => {
    // A rider whose record shows rent owed, so the default is visibly not 0.
    let rider = null as Awaited<ReturnType<typeof listAssignedRiders>>[number] | null;
    let recorded = 0;
    for (const r of await listAssignedRiders()) {
      const row = (await listRiderPayments(r.id))[0];
      recorded = Math.round(Math.max(0, (row?.totalDue ?? 0) - (row?.amountPaid ?? 0)) / 100);
      if (recorded > 0 && r.depositHeld >= 100_000) { rider = r; break; }
    }
    if (!rider) throw new Error('mock data has no rider with rent owed');
    vi.mocked(deboardRider).mockResolvedValue(rider);
    show(`/assignments/deboard?riderId=${rider.id}`);
    const user = userEvent.setup();

    const rent = await screen.findByRole('spinbutton', { name: 'Rent still owed (₹)' });
    await waitFor(() => expect(rent).toHaveValue(recorded));

    await user.clear(rent);
    await user.type(rent, '500');
    await user.click(screen.getByRole('button', { name: 'Finish and take the bike back' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Finish and take the bike back' }));

    await waitFor(() => expect(deboardRider).toHaveBeenCalled());
    expect(vi.mocked(deboardRider).mock.calls[0][0]).toMatchObject({
      outstandingRent: 50_000,
      depositRefund: rider.depositHeld - 50_000,
    });
  });
});
