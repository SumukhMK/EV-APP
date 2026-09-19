import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
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
  it('settles the rent but never asks the desk to guess a damage deduction', async () => {
    show();
    expect(await screen.findByRole('spinbutton', { name: 'Rent still owed (₹)' })).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: 'Deposit being returned (₹)' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Deposit left after rent owed').length).toBeGreaterThan(0);
    expect(screen.getByText(/decided on the service job/)).toBeInTheDocument();
  });
});
