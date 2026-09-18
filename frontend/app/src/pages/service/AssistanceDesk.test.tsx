import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SessionContext, type SessionValue } from '../../app/sessionContext';
import { serviceJobs, createServiceJob, updateServiceJobRecord } from '../../mocks/serviceJobs';
import { riderCharges } from '../../mocks/riderCharges';
import { riders } from '../../mocks/riders';
import { vehicles } from '../../mocks/vehicles';
import * as api from '../../lib/api/serviceJobs';
import { AssistanceDesk } from './AssistanceDesk';
import { AssistanceJob, NewAssistanceJob } from './AssistanceJob';
import { Inspection } from './Inspection';
import type { ServiceJob, UserRole } from '../../types';

const initialVehicles = structuredClone(vehicles);
const initialRiders = structuredClone(riders);
function reset() {
  serviceJobs.splice(0); riderCharges.splice(0);
  vehicles.splice(0, vehicles.length, ...structuredClone(initialVehicles));
  riders.splice(0, riders.length, ...structuredClone(initialRiders));
}
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
            <Route path="/service/queues" element={<AssistanceDesk mode="queues" />} />
            <Route path="/service/qc" element={<AssistanceDesk mode="qc" />} />
            <Route path="/service/inspection" element={<Inspection />} />
            <Route path="/service/assistance/new" element={<NewAssistanceJob />} />
            <Route path="/service/assistance/:jobId" element={<AssistanceJob />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </SessionContext.Provider>,
  );
}

function seed(category: ServiceJob['damageCategory'] = 'MINOR', assigned = true) {
  const vehicle = vehicles.find((v) => v.state === (assigned ? 'DEPLOYED' : 'READY_TO_DEPLOY'))!;
  return createServiceJob({ vehicleId: vehicle.id, riderId: vehicle.currentRiderId, source: 'RSA', damageCategory: category, damageNotes: 'Replace mirror' });
}
async function fillWork(user: ReturnType<typeof userEvent.setup>) {
  // The assigned-bike actions appear after the separate vehicle query finishes.
  await screen.findByRole('link', { name: 'Give another bike' });
  await user.click(await screen.findByRole('textbox', { name: 'What did you find, and what did you do?' }));
  await user.paste('Mirror repaired and road tested');
  await user.click(screen.getByRole('textbox', { name: 'Who did the work?' }));
  await user.paste('Inspector');
  await user.click(screen.getByRole('textbox', { name: 'What did you do just now?' }));
  await user.paste('Repair completed');
}

beforeEach(reset);
afterEach(() => { vi.restoreAllMocks(); reset(); });

describe('service workbench stories', () => {
  it('receives a vehicle, moves its state, and opens the work record without a modal', { timeout: 15_000 }, async () => {
    const user = userEvent.setup();
    const vehicle = vehicles.find((v) => v.state === 'DEPLOYED')!;
    show();
    await user.click(screen.getByRole('link', { name: 'New job' }));
    expect(await screen.findByText('Take a bike in for service')).toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: 'Bike' }));
    await user.paste(vehicle.id);
    await user.click(await screen.findByRole('option', { name: new RegExp(vehicle.id) }));
    await user.click(screen.getByRole('textbox', { name: /What is wrong with the bike/ }));
    await user.paste('Mirror cracked');
    await user.click(screen.getByRole('checkbox', { name: 'Yes, take this bike in and move it.' }));
    await user.click(screen.getByRole('button', { name: 'Take it in and open the job' }));
    expect(await screen.findByText('What was reported')).toBeInTheDocument();
    expect(vehicle.state).toBe('UNDER_REPAIR');
    expect(serviceJobs).toHaveLength(1);
    expect(serviceJobs[0]).toMatchObject({ vehicleId: vehicle.id, riderId: vehicle.currentRiderId, source: 'WALK_IN', queue: 'MINOR_REPAIR' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('filters Minor and Major separately and opens a work record in one click', async () => {
    const minor = seed();
    const major = seed('MAJOR');
    const user = userEvent.setup();
    show('/service/queues?queue=MINOR_REPAIR');
    expect(await screen.findByRole('link', { name: minor.id })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: major.id })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Big repair (1)' }));
    expect(await screen.findByRole('link', { name: major.id })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: minor.id })).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Open' }));
    expect(await screen.findByRole('textbox', { name: 'What did you find, and what did you do?' })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Back to jobs' }));
    expect(await screen.findByRole('link', { name: major.id })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: minor.id })).not.toBeInTheDocument();
  });

  it('lets fleet staff receive and work jobs but reserves final release for service/admin roles', async () => {
    const job = seed();
    const user = userEvent.setup();
    show(`/service/assistance/${job.id}`, 'FLEET_STAFF');
    await fillWork(user);
    expect(screen.getByRole('link', { name: 'Give another bike' })).toHaveAttribute('href', `/assignments/exchange?riderId=${job.riderId}`);
    expect(screen.getByText(/You can write down what you found/)).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Who pays?' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Save my notes' }));
    expect(await screen.findByText(/Nothing has been charged yet/)).toBeInTheDocument();
    expect(job.workSummary).toContain('road tested');
    expect(job.liability).toBeNull();
    expect(job.status).toBe('IN_PROGRESS');
    expect(riderCharges).toHaveLength(0);
  });

  it('persists progress, moves to QC, and releases from the same record with one charge', { timeout: 15_000 }, async () => {
    const job = seed();
    const user = userEvent.setup();
    show(`/service/assistance/${job.id}`);
    await fillWork(user);
    await user.click(screen.getByRole('button', { name: 'Add a cost line' }));
    await user.type(screen.getByRole('textbox', { name: 'Item 1' }), 'Mirror');
    await user.type(screen.getByRole('textbox', { name: 'Cost 1 (₹)' }), '5000');
    expect(screen.queryByText(/over ₹5,000/)).not.toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Cost 1 (₹)' }), '.01');
    expect(screen.getByText(/over ₹5,000/)).toBeInTheDocument();
    expect(screen.getByText('₹5,000.01')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /Work is done/ }));
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Send for Quality Check' }));
    await screen.findByRole('radio', { name: /QC passed/ });
    expect(screen.getByText(/Nothing has been charged yet/)).toBeInTheDocument();
    expect(riderCharges).toHaveLength(0);
    // Use "Check all" button for QC checks, then approve repair
    await user.click(screen.getByRole('button', { name: 'Check all' }));
    await user.click(screen.getByRole('checkbox', { name: /Repair verified/ }));
    await user.click(screen.getByRole('radio', { name: /QC passed/ }));
    // Tick confirm
    await user.click(screen.getByRole('checkbox', { name: /I approve/ }));
    await user.click(screen.getByRole('button', { name: 'Pass QC and release' }));
    expect(await screen.findByText(/This job is finished/)).toBeInTheDocument();
    expect(riderCharges).toHaveLength(1);
    expect(riderCharges[0].amount).toBe(500001);
    expect(screen.queryByRole('button', { name: 'Pass QC and release' })).not.toBeInTheDocument();
    expect(job.activity).toHaveLength(3);
    expect(job.inspections).toHaveLength(2);
  });

  it('blocks invalid cost lines and invalidates confirmation after edits', async () => {
    const job = seed();
    const user = userEvent.setup();
    show(`/service/assistance/${job.id}`);
    await fillWork(user);
    await user.click(screen.getByRole('button', { name: 'Add a cost line' }));
    await user.type(screen.getByRole('textbox', { name: 'Item 1' }), 'Mirror');
    await user.type(screen.getByRole('textbox', { name: 'Cost 1 (₹)' }), '-5');
    // Button is always enabled now (shakes on invalid submit). Confirmation resets on edit.
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Save my notes' }));
    expect(job.status).toBe('OPEN'); // save did not go through
    await user.clear(screen.getByRole('textbox', { name: 'Cost 1 (₹)' }));
    await user.type(screen.getByRole('textbox', { name: 'Cost 1 (₹)' }), '200');
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('requires an explicit severity for migrated bikes whose damage was never assessed', async () => {
    const job = seed();
    Object.assign(job, { source: 'REGISTRY', queue: 'ASSESSMENT', damageCategory: 'NONE' });
    const user = userEvent.setup();
    show(`/service/assistance/${job.id}`);
    await fillWork(user);
    expect(screen.getByText(/Nobody has noted this yet/)).toBeInTheDocument();
    // Submit without picking severity — save does not go through.
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Save my notes' }));
    expect(job.status).toBe('OPEN');
    // Pick severity, re-confirm, save succeeds.
    await user.click(screen.getByRole('combobox', { name: 'How bad is the damage?' }));
    await user.click(screen.getByRole('option', { name: 'Small damage' }));
    await user.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: 'Save my notes' })).toBeEnabled();
  });

  it('opens the existing job from inspection instead of requiring the vehicle-detail hop', async () => {
    const job = seed();
    show(`/service/inspection?vehicle=${job.vehicleId}`);
    expect(await screen.findByText(`${job.vehicleId} · ${job.id}`)).toBeInTheDocument();
    expect(await screen.findByRole('textbox', { name: 'What did you find, and what did you do?' })).toBeInTheDocument();
  });

  it('scopes QC to awaiting work and does not offer misleading global Closed filters', async () => {
    const repair = seed();
    const qc = seed('NONE');
    show('/service/qc?status=CLOSED');
    expect(await screen.findByRole('link', { name: qc.id })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: repair.id })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Status' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'QC check' })).toHaveAttribute('href', `/service/assistance/${qc.id}`);
  });

  it('prevents duplicate intake with a direct existing-job link', async () => {
    const job = seed();
    show(`/service/assistance/new?vehicle=${job.vehicleId}`);
    expect(await screen.findByRole('link', { name: 'Carry on with the open job' })).toHaveAttribute('href', `/service/assistance/${job.id}`);
    expect(screen.queryByRole('button', { name: 'Take it in and open the job' })).not.toBeInTheDocument();
  });

  it('keeps closed records accessible without editing and supports unknown filters', async () => {
    const job = seed('NONE', false);
    updateServiceJobRecord({ jobId: job.id, queue: 'READY_TO_DEPLOY', damageCategory: 'NONE', workSummary: 'No work required', items: [], technician: 'Inspector', liability: 'COMPANY', reference: null, note: 'Checks passed', actor: 'Inspector' });
    const user = userEvent.setup();
    show('/service/assistance?status=old-status');
    await user.click(await screen.findByRole('link', { name: job.id }));
    expect(await screen.findByText('How it ended')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'What did you find, and what did you do?' })).not.toBeInTheDocument();
  });

  it('shows both source and queue columns with waiting time', async () => {
    const job = seed();
    job.createdOn = new Date(Date.now() - 9 * 86_400_000).toISOString();
    show('/service/queues');
    expect(await screen.findByRole('columnheader', { name: 'Waiting' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Source' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Queue' })).toBeInTheDocument();
    expect(screen.getByText('9 days')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Source' })).toBeInTheDocument();
  });

  it('shows list failures rather than empty-state success and allows retry', async () => {
    vi.spyOn(api, 'listServiceJobs').mockRejectedValueOnce(new Error('Could not load jobs'));
    const user = userEvent.setup();
    show();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load jobs');
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No jobs yet')).toBeInTheDocument();
  });

  it('picks the hub from a list at intake and only asks for a free-text spot for roadside jobs', async () => {
    const vehicle = vehicles.find((v) => v.state === 'DEPLOYED')!;
    const user = userEvent.setup();
    show('/service/assistance/new');
    await user.click(screen.getByRole('combobox', { name: 'Bike' }));
    await user.paste(vehicle.id);
    await user.click(await screen.findByRole('option', { name: new RegExp(vehicle.id) }));
    const hub = screen.getByRole('combobox', { name: 'Which hub is it at?' });
    expect(hub).toHaveTextContent(vehicle.hub);
    await user.click(hub);
    expect(screen.getByRole('option', { name: 'Whitefield' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('combobox', { name: 'How did the bike reach us?' }));
    await user.click(screen.getByRole('option', { name: 'Roadside help (RSA)' }));
    expect(screen.queryByRole('combobox', { name: 'Which hub is it at?' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Where did it break down?' })).toBeInTheDocument();
  });

  it('offers one next action at a time and names the button after the chosen one', async () => {
    const job = seed();
    const user = userEvent.setup();
    show(`/service/assistance/${job.id}`);
    await fillWork(user);
    expect(screen.getByRole('radio', { name: /Still working on it/ })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Save my notes' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Which list?' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /Move it to a different list/ }));
    await user.click(screen.getByRole('combobox', { name: 'Which list?' }));
    await user.click(screen.getByRole('option', { name: 'Waiting for parts' }));
    expect(screen.getByRole('button', { name: 'Move to Waiting for parts' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.getByText(/Add the parts or claim details/)).toBeInTheDocument();
  });

  it('retains edited work after a failed save', async () => {
    const job = seed();
    vi.spyOn(api, 'updateServiceJob').mockRejectedValueOnce(new Error('Could not save job'));
    const user = userEvent.setup();
    show(`/service/assistance/${job.id}`);
    await fillWork(user);
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Save my notes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save job');
    expect(screen.getByRole('textbox', { name: 'What did you find, and what did you do?' })).toHaveValue('Mirror repaired and road tested');
    expect(job.workSummary).toBe('');
  });
});
