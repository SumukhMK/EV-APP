import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ExchangeVehicle } from './ExchangeVehicle';
import { exchangeVehicle } from '../../lib/api/assignments';
import { listAssignedRiders } from '../../lib/api/riders';
import { getVehicle } from '../../lib/api/vehicles';
import { getVehicleServiceHistory } from '../../lib/api/inspections';

vi.mock('../../lib/api/assignments', async (original) => ({
  ...(await original<typeof import('../../lib/api/assignments')>()),
  exchangeVehicle: vi.fn(),
}));
vi.mock('../../lib/api/vehicles', async (original) => ({
  ...(await original<typeof import('../../lib/api/vehicles')>()),
  getVehicle: vi.fn(),
}));
vi.mock('../../lib/api/inspections', async (original) => ({
  ...(await original<typeof import('../../lib/api/inspections')>()),
  getVehicleServiceHistory: vi.fn(),
}));

function show(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <ExchangeVehicle />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('exchange a bike that is already on a job card', () => {
  /**
   * The job card already says what is wrong. Coming back to swap the rider
   * onto another bike asks only for the new bike and the date — not the
   * condition, reason and damaged parts a second time.
   */
  it('asks only for the new bike, and says the old one stays in service', async () => {
    const [rider] = await listAssignedRiders();
    const held = rider.currentVehicleId!;
    const real = await (await vi.importActual<typeof import('../../lib/api/vehicles')>('../../lib/api/vehicles')).getVehicle(held);
    vi.mocked(getVehicle).mockResolvedValue({ ...real, state: 'UNDER_REPAIR' });
    vi.mocked(getVehicleServiceHistory).mockResolvedValue([{ id: 'J30', status: 'OPEN' } as never]);
    vi.mocked(exchangeVehicle).mockResolvedValue({ ...rider, currentVehicleId: 'NEW' } as never);
    const user = userEvent.setup();
    show(`/assignments/exchange?riderId=${rider.id}`);

    expect(await screen.findByText('The bike going to service')).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${held} stays in .* on job`))).toBeInTheDocument();
    expect(screen.queryByText('The bike coming back')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'What condition is the bike in?' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Why the swap?' })).not.toBeInTheDocument();

    const bikes = await screen.findAllByRole('radio');
    await user.click(bikes[0]);
    await user.click(screen.getByRole('button', { name: 'Save the swap' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toMatch(/old bike stays on its job card/);
    await user.click(within(dialog).getByRole('button', { name: 'Save the swap' }));

    await waitFor(() => expect(exchangeVehicle).toHaveBeenCalled());
    expect(vi.mocked(exchangeVehicle).mock.calls[0][0]).toMatchObject({
      riderId: rider.id,
      fromVehicleId: held,
      reason: 'SERVICE_REQUIRED',
      returnCondition: 'NONE',
      damageItems: [],
    });
  });
});
