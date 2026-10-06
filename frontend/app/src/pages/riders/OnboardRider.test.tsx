import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { onboardRider } from '../../lib/api/riders';
import { OnboardRider } from './OnboardRider';

vi.mock('../../lib/api/riders', () => ({ onboardRider: vi.fn() }));

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/riders/onboard']}>
        <OnboardRider />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(onboardRider).mockReset();
});

describe('onboard rider — the form answers a refused submit', () => {
  /** An empty submit used to redden fields below the fold and otherwise sit still. */
  it('says how many fields need attention, scrolls to the first section and shakes it', async () => {
    show();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Onboard rider' }));
    // The shake class is added synchronously on submit and removed 600ms
    // later. Assert it before any await: under full-suite load the findByText
    // wait below can outlast the removal timer and the class is already gone.
    expect(document.getElementById('step-1')?.classList.contains('shake-field')).toBe(true);
    expect(await screen.findByText(/fields need attention — the first is marked below/)).toBeInTheDocument();
    expect(onboardRider).not.toHaveBeenCalled();
  });

  /** State first; the city list is that state's, and no coordinates box. */
  it('offers cities for the chosen state only, and no coordinates field', async () => {
    show();
    const user = userEvent.setup();
    expect(screen.queryByLabelText(/Location coordinates/)).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'City' })).toHaveAttribute('placeholder', 'Pick the state first');
    await user.click(screen.getByRole('combobox', { name: 'State' }));
    await user.click(await screen.findByRole('option', { name: 'Karnataka' }));
    await user.click(screen.getByRole('combobox', { name: 'City' }));
    expect(await screen.findByRole('option', { name: 'Bengaluru' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Chennai' })).not.toBeInTheDocument();
  });
});
