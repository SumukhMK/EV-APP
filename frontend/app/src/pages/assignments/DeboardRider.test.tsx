import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { DeboardRider } from './DeboardRider';

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/assignments/deboard']}>
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
});
