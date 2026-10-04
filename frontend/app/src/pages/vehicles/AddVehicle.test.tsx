import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { getFormOptions } from '../../lib/api/reference';
import { AddVehicle } from './AddVehicle';

vi.mock('../../lib/api/reference', () => ({
  getFormOptions: vi.fn(),
}));
vi.mock('../../lib/api/vehicles', () => ({
  createVehicle: vi.fn(),
}));

const formOptions = vi.mocked(getFormOptions);

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/vehicles/new']}>
        <AddVehicle />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  formOptions.mockReset();
});

/**
 * The hub and model pickers list what the tenant has, not what the mocks
 * were seeded with. They used to read two constants from src/mocks/seed, so
 * a hub added through the API never appeared on this form.
 */
describe('add vehicle reference data', () => {
  it('offers the hubs and models the API returns', async () => {
    formOptions.mockResolvedValue({
      hubs: [
        { id: 'h1', name: 'Whitefield', active: true },
        { id: 'h2', name: 'Yelahanka', active: true },
      ],
      models: [{ id: 'm1', name: 'Eagle-SunM', make: 'e-Connects', active: true }],
    });
    show();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('combobox', { name: 'Hub' }));
    expect(await screen.findByRole('option', { name: 'Yelahanka' })).toBeInTheDocument();
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('combobox', { name: 'Model' }));
    expect(await screen.findByRole('option', { name: 'Eagle-SunM' })).toBeInTheDocument();
  });

  it('leaves out hubs and models that were retired', async () => {
    formOptions.mockResolvedValue({
      hubs: [
        { id: 'h1', name: 'Whitefield', active: true },
        { id: 'h3', name: 'Old Depot', active: false },
      ],
      models: [],
    });
    show();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('combobox', { name: 'Hub' }));
    expect(await screen.findByRole('option', { name: 'Whitefield' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Old Depot' })).not.toBeInTheDocument();
  });
});
