import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { onboardRider } from '../../lib/api/riders';
import type { Rider } from '../../types';
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

/** The same screen, but with the rider record it routes to, so the route is observable. */
function showWithRoutes() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/riders/onboard']}>
        <Routes>
          <Route path="/riders/onboard" element={<OnboardRider />} />
          <Route path="/riders/:id" element={<div>Rider detail page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const createdRider: Rider = {
  id: 'BLRSS0428',
  name: 'Ravi Kumar',
  phone: '9876543210',
  status: 'ACTIVE',
  kycStatus: 'PENDING',
  planAmount: 175000,
  depositHeld: 300000,
  billingDay: 'MONDAY',
  currentVehicleId: null,
  onboardedOn: '2026-10-07',
  paymentStatus: 'PENDING',
  duesPaise: 0,
  platform: 'Zomato',
  paymentDay: 'MONDAY',
  paymentMode: 'UPI',
};

/** Fill every required field so the submit reaches the API. */
async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText('12 digit Aadhaar number'), '123456789012');
  await user.type(screen.getByPlaceholderText('As on Aadhaar'), 'Ravi Kumar');
  await user.type(screen.getByPlaceholderText('Address as per Aadhaar'), '12 Main Road, Bengaluru');
  await user.type(screen.getByPlaceholderText('10 digit mobile number'), '9876543210');
  await user.type(screen.getByPlaceholderText('10 digit WhatsApp number'), '9876543211');
  await user.type(screen.getByPlaceholderText('10 digit alternate number'), '9876543212');
  await user.type(screen.getByPlaceholderText('House, street, area'), '12 Main Street, Bengaluru');
  await user.click(screen.getByRole('combobox', { name: /State/ }));
  await user.click(await screen.findByRole('option', { name: 'Karnataka' }));
  await user.click(screen.getByRole('combobox', { name: /City/ }));
  await user.click(await screen.findByRole('option', { name: 'Bengaluru' }));
  await user.type(screen.getByLabelText(/PIN code/), '560001');
  await user.type(screen.getByPlaceholderText('Type or pick a platform'), 'Zomato');
}

beforeEach(() => {
  vi.mocked(onboardRider).mockReset();
});

describe('onboard rider — the form answers a refused submit', () => {
  /** An empty submit used to redden fields below the fold and otherwise sit still. */
  it('says how many fields need attention, scrolls to the first field and shakes it', async () => {
    show();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Onboard rider' }));
    expect(await screen.findByText(/fields need attention — the first is marked below/)).toBeInTheDocument();
    // The first red field is the one that needs attention — it is shaken, not
    // the section it lives in. The shake lands on the next tick and is
    // removed 600ms later, so waitFor catches it.
    const aadhaar = screen.getByPlaceholderText('12 digit Aadhaar number');
    await waitFor(() => expect(aadhaar.closest('.MuiFormControl-root')).toHaveClass('shake-field'));
    expect(onboardRider).not.toHaveBeenCalled();
  });

  /** State first; the city list is that state's, and no coordinates box. */
  it('offers cities for the chosen state only, and no coordinates field', async () => {
    show();
    const user = userEvent.setup();
    expect(screen.queryByLabelText(/Location coordinates/)).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /City/ })).toHaveAttribute('placeholder', 'Pick the state first');
    await user.click(screen.getByRole('combobox', { name: /State/ }));
    await user.click(await screen.findByRole('option', { name: 'Karnataka' }));
    await user.click(screen.getByRole('combobox', { name: /City/ }));
    expect(await screen.findByRole('option', { name: 'Bengaluru' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Chennai' })).not.toBeInTheDocument();
  });

  /** The word, not an asterisk — and the two optional fields stay unmarked. */
  it('marks the required fields as Mandatory and leaves the optional ones alone', () => {
    show();
    // Eleven required inputs: 3 identity, 3 contact, 4 address, 1 commercial.
    // MUI renders an outlined label twice (the notch legend duplicates it),
    // so the marker is asserted on the label/overline element, not counted
    // as spans.
    const required = [
      /01\. Aadhaar number/, /Full name/, /Permanent address/,
      /02\. Primary mobile number/, /03\. WhatsApp number/, /04\. Alternate number/,
      /Local address/, /State/, /City/, /PIN code/, /Working platform/,
    ];
    for (const label of required) {
      expect(screen.getByText(label, { selector: 'label, .MuiTypography-overline' }).textContent).toContain('Mandatory');
    }
    // The two optional documents and the platform rider id stay unmarked.
    for (const label of [/PAN number/, /Driving licence/, /Platform rider id/]) {
      expect(screen.getByText(label, { selector: 'label' }).textContent).not.toContain('Mandatory');
    }
  });
});

describe('onboard rider — the confirmation lands before the route', () => {
  /**
   * The save used to route straight to the rider's record, so the only
   * confirmation was the Snackbar on the destination screen. The operator
   * wants the message on the screen they are standing on, before it moves.
   */
  it('shows the confirmation on the onboarding screen, then routes to the rider', async () => {
    vi.mocked(onboardRider).mockResolvedValue(createdRider);
    showWithRoutes();
    // delay: null — the form is long, and the per-keystroke delay is not what
    // this test is about.
    const user = userEvent.setup({ delay: null });
    await fillForm(user);

    await user.click(screen.getByRole('button', { name: 'Onboard rider' }));

    // The confirmation is on this screen, and the route has not changed yet.
    expect(await screen.findByText('Ravi Kumar onboarded as BLRSS0428')).toBeInTheDocument();
    expect(screen.queryByText('Rider detail page')).not.toBeInTheDocument();

    // Closing the Snackbar — here by its timeout — is what moves on.
    expect(await screen.findByText('Rider detail page', undefined, { timeout: 3000 })).toBeInTheDocument();
  }, 20000);
});
