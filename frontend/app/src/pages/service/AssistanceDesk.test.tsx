import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SessionContext, type SessionValue } from '../../app/sessionContext';
import { serviceJobs, createServiceJob, closeServiceJobRecord } from '../../mocks/serviceJobs';
import { riderCharges } from '../../mocks/riderCharges';
import { vehicles } from '../../mocks/vehicles';
import * as api from '../../lib/api/serviceJobs';
import { AssistanceDesk } from './AssistanceDesk';
import { AssistanceJob, NewAssistanceJob } from './AssistanceJob';
import type { UserRole } from '../../types';

function show(path = '/service/assistance', role: UserRole = 'SERVICE_MANAGER') {
  const session: SessionValue = {
    user: { name: 'Demo operator', roleKey: role, email: 'demo@example.test' },
    tenant: 'Demo', personas: [], signedIn: true,
    signIn: vi.fn(), signOut: vi.fn(), switchPersona: vi.fn(),
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <SessionContext.Provider value={session}>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/service/assistance" element={<AssistanceDesk />} />
            <Route path="/service/assistance/new" element={<NewAssistanceJob />} />
            <Route path="/service/assistance/:jobId" element={<AssistanceJob />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </SessionContext.Provider>,
  );
}

function seed(riderId: string | null = 'R001') {
  return createServiceJob({ vehicleId: 'BLRSS0001', riderId, source: 'RSA', damageCategory: 'MINOR', damageNotes: 'Replace mirror' });
}

beforeEach(() => { serviceJobs.splice(0); riderCharges.splice(0); });
afterEach(() => { vi.restoreAllMocks(); serviceJobs.splice(0); riderCharges.splice(0); });

describe('Assistance desk page workflow', () => {
  it('creates a job on a dedicated page and opens its record without a dialog', async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getAllByRole('link', { name: 'New job' })[0]);
    expect(await screen.findByText('New service job')).toBeInTheDocument();
    const vehicle = vehicles.find((v) => v.state === 'DEPLOYED')!;
    const picker = screen.getByRole('combobox', { name: 'Vehicle' });
    await user.type(picker, vehicle.id);
    await user.click(await screen.findByRole('option', { name: new RegExp(vehicle.id) }));
    await user.type(screen.getByRole('textbox', { name: 'Reported issue / notes' }), 'Check mirror');
    await user.click(screen.getByRole('button', { name: 'Create job' }));
    expect(await screen.findByText('Reported issue')).toBeInTheDocument();
    expect(serviceJobs).toHaveLength(1);
    expect(serviceJobs[0]).toMatchObject({ vehicleId: vehicle.id, riderId: vehicle.currentRiderId, source: 'WALK_IN', damageNotes: 'Check mirror' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('restores list filters on back and provides read-only details for fleet staff', async () => {
    const job = seed();
    const user = userEvent.setup();
    show(`/service/assistance?search=${job.id}&status=ALL`, 'FLEET_STAFF');
    await user.click(await screen.findByRole('link', { name: job.id }));
    expect(await screen.findByText('Reported issue')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close job' })).not.toBeInTheDocument();
    expect(screen.getByText(/View-only access/)).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Back to jobs' }));
    expect(screen.getByRole('textbox', { name: 'Search jobs' })).toHaveValue(job.id);
    expect(screen.queryByRole('link', { name: 'New job' })).not.toBeInTheDocument();
  });

  it('blocks direct access to the create form for a view-only role', () => {
    show('/service/assistance/new', 'FLEET_STAFF');
    expect(screen.getByText('Your role can view jobs but cannot create them.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create job' })).not.toBeInTheDocument();
  });

  it('validates costs, flags above 5000, resets confirmation on edits and closes once', async () => {
    const job = seed();
    const user = userEvent.setup();
    show(`/service/assistance/${job.id}`);
    const cost = await screen.findByRole('textbox', { name: 'Cost 1 (₹)' });
    await user.type(screen.getByRole('textbox', { name: 'Part / work 1' }), 'Mirror');
    await user.type(cost, '-5');
    expect(screen.getByText('Enter a positive cost, up to 2 decimals.')).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toBeDisabled();
    await user.clear(cost);
    await user.type(cost, '5000');
    expect(screen.queryByText(/Above ₹5,000/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox'));
    await user.clear(cost);
    await user.type(cost, '5001');
    expect(screen.getByText(/Above ₹5,000/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Close job' })).toBeDisabled();
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Close job' }));
    expect(await screen.findByText(/Job closed. The final work/)).toBeInTheDocument();
    expect(riderCharges).toHaveLength(1);
    expect(job.totalCostPaise).toBe(500100);
    expect(screen.queryByRole('button', { name: 'Close job' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows closed records and safely defaults unlinked jobs to company liability', async () => {
    const job = seed(null);
    const user = userEvent.setup();
    show(`/service/assistance/${job.id}`);
    expect(await screen.findByText('No rider is linked, so this job must be written off to the company.')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Part / work 1' }), 'Labour');
    await user.type(screen.getByRole('textbox', { name: 'Cost 1 (₹)' }), '100');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Close job' }));
    await screen.findByText(/Job closed. The final work/);
    expect(job.liability).toBe('COMPANY');
    expect(riderCharges).toHaveLength(0);
    await user.click(screen.getByRole('link', { name: 'Back to jobs' }));
    await screen.findByText('No matching jobs');
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(await screen.findByRole('link', { name: job.id })).toBeInTheDocument();
  });

  it('keeps unknown status filters usable and closed records immutable', async () => {
    const job = seed();
    closeServiceJobRecord({ jobId: job.id, items: [{ label: 'Mirror', costPaise: 20000 }], liability: 'COMPANY', technician: null });
    const user = userEvent.setup();
    show('/service/assistance?status=old-status');
    await user.click(await screen.findByRole('link', { name: job.id }));
    expect(await screen.findByText('Resolution')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Part / work 1' })).not.toBeInTheDocument();
  });

  it('shows loading failures instead of an empty list and allows retry', async () => {
    vi.spyOn(api, 'listServiceJobs').mockRejectedValueOnce(new Error('Could not load jobs'));
    const user = userEvent.setup();
    show();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load jobs');
    expect(screen.queryByText('No jobs yet')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No jobs yet')).toBeInTheDocument();
  });

  it('retains work and displays close failures for a retry', async () => {
    const job = seed();
    vi.spyOn(api, 'closeServiceJob').mockRejectedValueOnce(new Error('Could not close job'));
    const user = userEvent.setup();
    show(`/service/assistance/${job.id}`);
    await user.type(await screen.findByRole('textbox', { name: 'Part / work 1' }), 'Mirror');
    await user.type(screen.getByRole('textbox', { name: 'Cost 1 (₹)' }), '200');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Close job' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Could not close job'));
    expect(screen.getByRole('textbox', { name: 'Part / work 1' })).toHaveValue('Mirror');
    expect(job.status).toBe('OPEN');
    expect(riderCharges).toHaveLength(0);
  });
});
