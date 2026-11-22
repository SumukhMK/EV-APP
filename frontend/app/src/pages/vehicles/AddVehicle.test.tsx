import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { getFormOptions } from '../../lib/api/reference';
import { createVehicle } from '../../lib/api/vehicles';
import { AddVehicle } from './AddVehicle';

vi.mock('../../lib/api/reference', () => ({
  getFormOptions: vi.fn(),
}));
vi.mock('../../lib/api/vehicles', () => ({
  createVehicle: vi.fn(),
}));

const formOptions = vi.mocked(getFormOptions);
const create = vi.mocked(createVehicle);

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
  create.mockReset();
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

    await user.click(screen.getByRole('combobox', { name: /Model/ }));
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

/**
 * The word, not an asterisk — the same courtesy the rider form pays. Only the
 * required fields that start empty are marked; hub and battery arrive with a
 * sensible default, so they read as answered already.
 */
describe('add vehicle mandatory markers', () => {
  it('marks the required fields as Mandatory and leaves the rest alone', () => {
    formOptions.mockResolvedValue({ hubs: [], models: [] });
    show();
    // MUI renders an outlined label twice (the notch legend duplicates it), and
    // a select's label is a div rather than a label, so the marker is asserted
    // on the label element itself, not counted as spans.
    for (const label of [/Vehicle id/, /Chassis number/, /Purchase date/, /Make/, /Model/]) {
      expect(screen.getByText(label, { selector: '.MuiInputLabel-root' }).textContent).toContain('Mandatory');
    }
    for (const label of ['Hub', 'Battery', 'Battery vendor', 'Motor number', 'Controller number', 'RFID tag', 'Notes']) {
      expect(screen.getByText(label, { selector: '.MuiInputLabel-root' }).textContent).not.toContain('Mandatory');
    }
  });
});

describe('add vehicle validation guidance', () => {
  /** A refused submit used to redden fields below the fold and otherwise sit still. */
  it('says how many fields need attention, scrolls to the first field and shakes it', async () => {
    formOptions.mockResolvedValue({ hubs: [], models: [] });
    show();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Save vehicle' }));
    expect(await screen.findByText(/fields need attention — the first is marked below/)).toBeInTheDocument();
    // The first red field is the one that needs attention — it is shaken, not
    // the section it lives in. The shake lands on the next tick and is removed
    // 600ms later, so waitFor catches it.
    const id = screen.getByPlaceholderText('BLRSS0451');
    await waitFor(() => expect(id.closest('.MuiFormControl-root')).toHaveClass('shake-field'));
    expect(create).not.toHaveBeenCalled();
  });
});
