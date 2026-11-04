import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SessionContext, type SessionValue } from '../../app/sessionContext';
import { serviceJobs, createServiceJob, updateServiceJobRecord } from '../../mocks/serviceJobs';
import { riderCharges } from '../../mocks/riderCharges';
import { riders } from '../../mocks/riders';
import { vehicles } from '../../mocks/vehicles';
import * as api from '../../lib/api/serviceJobs';
import { AssistanceJob, NewAssistanceJob } from './AssistanceJob';
import { Inspection } from './Inspection';
import { ServiceManagement } from './ServiceManagement';
import type { ServiceJob, UserRole } from '../../types';

const initialVehicles = structuredClone(vehicles);
const initialRiders = structuredClone(riders);
function reset() {
  serviceJobs.splice(0); riderCharges.splice(0);
  vehicles.splice(0, vehicles.length, ...structuredClone(initialVehicles));
  riders.splice(0, riders.length, ...structuredClone(initialRiders));
}
function show(path: string, role: UserRole = 'SERVICE_MANAGER') {
  const session: SessionValue = {
    user: { name: 'Demo operator', roleKey: role, email: 'demo@example.test' },
    tenant: 'Demo', personas: [], signedIn: true, restoring: false,
    signIn: vi.fn(), signOut: vi.fn(), switchPersona: vi.fn(),
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <SessionContext.Provider value={session}>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/service/queues" element={<ServiceManagement />} />
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
  // RSA is a rider's bike by definition, so a bike with no rider comes in as an old record.
  return createServiceJob({ vehicleId: vehicle.id, riderId: vehicle.currentRiderId, source: assigned ? 'RSA' : 'REGISTRY', damageCategory: category, damageNotes: 'Replace mirror' });
}
async function fillWork(user: ReturnType<typeof userEvent.setup>) {
  // The assigned-bike actions appear after the separate vehicle query finishes.
  await screen.findByRole('link', { name: 'Give another bike' });
  await user.click(screen.getByRole('button', { name: 'Work done — send for Quality Check' }));
  const dialog = within(await screen.findByRole('dialog'));
  await user.click(dialog.getByRole('textbox', { name: 'What did you find, and what did you do?' }));
  await user.paste('Mirror repaired and road tested');
  await user.click(dialog.getByRole('textbox', { name: 'Ticket Resolved By (Technician)' }));
  await user.paste('Inspector');
  return dialog;
}

beforeEach(reset);
afterEach(() => { vi.restoreAllMocks(); reset(); });

describe('service workbench stories', () => {
  it('receives a vehicle, moves its state, and opens the work record without a modal', { timeout: 15_000 }, async () => {
    const user = userEvent.setup();
    const vehicle = vehicles.find((v) => v.state === 'DEPLOYED')!;
    show('/service/assistance/new');
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


  it('lets fleet staff receive, work and release jobs — liability is fleet work', async () => {
    const job = seed();
    const user = userEvent.setup();
    show(`/service/assistance/${job.id}`, 'FLEET_STAFF');
    expect(await screen.findByRole('link', { name: 'Give another bike' })).toHaveAttribute('href', `/assignments/exchange?riderId=${job.riderId}`);
    const dialog = await fillWork(user);
    await user.click(dialog.getByRole('button', { name: 'Send for Quality Check' }));
    expect(await screen.findByText(/Nothing has been charged yet/)).toBeInTheDocument();
    expect(job.workSummary).toContain('road tested');
    expect(job.technician).toBe('Inspector');
    expect(job.status).toBe('IN_PROGRESS');
    expect(riderCharges).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Do the Quality Check' }));
    expect(within(await screen.findByRole('dialog')).getByRole('combobox', { name: 'Who pays?' })).toBeInTheDocument();
  });

  it('lets the service manager work jobs but not decide who pays or release', async () => {
    const job = seed();
    const user = userEvent.setup();
    show(`/service/assistance/${job.id}`, 'SERVICE_MANAGER');
    const dialog = await fillWork(user);
    await user.click(dialog.getByRole('button', { name: 'Send for Quality Check' }));
    await user.click(await screen.findByRole('button', { name: 'Do the Quality Check' }));
    const qc = within(await screen.findByRole('dialog'));
    expect(qc.getByText(/You can fail the bike back/)).toBeInTheDocument();
    expect(qc.queryByRole('combobox', { name: 'Who pays?' })).not.toBeInTheDocument();
    expect(qc.queryByRole('button', { name: 'Pass QC and release' })).not.toBeInTheDocument();
    expect(qc.getByRole('button', { name: /Fail — send back/ })).toBeInTheDocument();
  });

  it('records the work, sends it to QC, and releases from the same record with one charge', { timeout: 15_000 }, async () => {
    const job = seed();
    const user = userEvent.setup();
    show(`/service/assistance/${job.id}`, 'FLEET_ADMIN');
    const dialog = await fillWork(user);
    await user.click(dialog.getByRole('button', { name: 'Add a cost line' }));
    await user.type(dialog.getByRole('textbox', { name: 'Item 1' }), 'Mirror');
    await user.type(dialog.getByRole('textbox', { name: 'Cost 1 (₹)' }), '5000');
    expect(dialog.queryByText(/over ₹5,000/)).not.toBeInTheDocument();
    await user.type(dialog.getByRole('textbox', { name: 'Cost 1 (₹)' }), '.01');
    expect(dialog.getByText(/over ₹5,000/)).toBeInTheDocument();
    expect(dialog.getByText('Total: ₹5,000.01')).toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: 'Send for Quality Check' }));
    expect(await screen.findByText(/Nothing has been charged yet/)).toBeInTheDocument();
    expect(riderCharges).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Do the Quality Check' }));
    const qc = within(await screen.findByRole('dialog'));
    // Passing with checks missing shakes and saves nothing.
    await user.click(qc.getByRole('button', { name: 'Pass QC and release' }));
    expect(job.status).toBe('IN_PROGRESS');
    // "Check all" covers the repair sign-off too, so passing is two clicks.
    await user.click(qc.getByRole('button', { name: 'Check all' }));
    expect(qc.getByRole('checkbox', { name: /Repair verified/ })).toBeChecked();
    await user.click(qc.getByRole('button', { name: 'Pass QC and release' }));
    expect(await screen.findByText(/This job is finished/)).toBeInTheDocument();
    expect(riderCharges).toHaveLength(1);
    expect(riderCharges[0].amount).toBe(500001);
    expect(job.technician).toBe('Inspector');
    expect(screen.queryByRole('button', { name: 'Do the Quality Check' })).not.toBeInTheDocument();
    expect(job.activity).toHaveLength(3);
    expect(job.inspections).toHaveLength(2);
  });

  it('blocks invalid cost lines', async () => {
    const job = seed();
    const user = userEvent.setup();
    show(`/service/assistance/${job.id}`);
    const dialog = await fillWork(user);
    await user.click(dialog.getByRole('button', { name: 'Add a cost line' }));
    await user.type(dialog.getByRole('textbox', { name: 'Item 1' }), 'Mirror');
    await user.type(dialog.getByRole('textbox', { name: 'Cost 1 (₹)' }), '-5');
    await user.click(dialog.getByRole('button', { name: 'Send for Quality Check' }));
    expect(job.status).toBe('OPEN'); // save did not go through
    expect(dialog.getByText(/Every cost line needs/)).toBeInTheDocument();
    await user.clear(dialog.getByRole('textbox', { name: 'Cost 1 (₹)' }));
    await user.type(dialog.getByRole('textbox', { name: 'Cost 1 (₹)' }), '200');
    await user.click(dialog.getByRole('button', { name: 'Send for Quality Check' }));
    expect(await screen.findByText(/Nothing has been charged yet/)).toBeInTheDocument();
  });

  it('requires an explicit severity for migrated bikes whose damage was never assessed', async () => {
    const job = seed();
    Object.assign(job, { source: 'REGISTRY', queue: 'ASSESSMENT', damageCategory: 'NONE' });
    const user = userEvent.setup();
    show(`/service/assistance/${job.id}`);
    const dialog = await fillWork(user);
    expect(dialog.getByText(/Nobody has noted this yet/)).toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: 'Send for Quality Check' }));
    expect(job.status).toBe('OPEN');
    await user.click(dialog.getByRole('combobox', { name: 'How bad is the damage?' }));
    await user.click(screen.getByRole('option', { name: 'Small damage' }));
    await user.click(dialog.getByRole('button', { name: 'Send for Quality Check' }));
    expect(await screen.findByText(/Nothing has been charged yet/)).toBeInTheDocument();
  });

  it('opens the existing job from inspection instead of requiring the vehicle-detail hop', async () => {
    const job = seed();
    show(`/service/inspection?vehicle=${job.vehicleId}`);
    expect(await screen.findByText(`${job.vehicleId} · ${job.id}`)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Work done — send for Quality Check' })).toBeInTheDocument();
  });

  /**
   * A routine check offers one damage level, "No damage", yet the form opened
   * on "Small damage" — a value its own picker did not list (MUI warned about
   * it on every render) — and the summary promised "Needs checking / In
   * Service" until the operator re-picked the only option there was.
   */
  it('a routine check opens on No damage and the QC queue, the only choice it offers', async () => {
    const fresh = vehicles.find((v) => v.state === 'READY_TO_DEPLOY' && !serviceJobs.some((j) => j.vehicleId === v.id))!;
    show(`/service/inspection?vehicle=${fresh.id}`);

    expect(await screen.findByRole('combobox', { name: 'How bad is the damage?' })).toHaveTextContent('No damage');
    expect(screen.getByRole('combobox', { name: 'Which list should it go to?' })).toHaveTextContent('Quality Check');
  });



  it('prevents duplicate intake with a direct existing-job link', async () => {
    const job = seed();
    show(`/service/assistance/new?vehicle=${job.vehicleId}`);
    expect(await screen.findByRole('link', { name: 'Carry on with the open job' })).toHaveAttribute('href', `/service/assistance/${job.id}`);
    expect(screen.queryByRole('button', { name: 'Take it in and open the job' })).not.toBeInTheDocument();
  });

  it('keeps closed records accessible without editing', async () => {
    const job = seed('NONE', false);
    updateServiceJobRecord({ jobId: job.id, queue: 'READY_TO_DEPLOY', damageCategory: 'NONE', workSummary: 'No work required', items: [], technician: 'Inspector', liability: 'COMPANY', reference: null, note: 'Checks passed', actor: 'Inspector' });
    show(`/service/assistance/${job.id}`);
    expect(await screen.findByText('How it ended')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'What did you find, and what did you do?' })).not.toBeInTheDocument();
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

  it('moves a job to Waiting for parts from its own pop-up, and asks which parts first', async () => {
    const job = seed();
    const user = userEvent.setup();
    show(`/service/assistance/${job.id}`);
    await user.click(await screen.findByRole('button', { name: 'Waiting on parts or a claim' }));
    const dialog = within(await screen.findByRole('dialog'));
    // A bike on the small-repair bench is most often waiting on parts, so that is the list it offers first.
    expect(dialog.getByRole('combobox', { name: 'Which list?' })).toHaveTextContent('Waiting for parts');
    await user.click(dialog.getByRole('button', { name: 'Move to Waiting for parts' }));
    expect(job.queue).not.toBe('PARTS_WAITING');
    expect(dialog.getByText('Add the parts or claim details.')).toBeInTheDocument();
    await user.click(dialog.getByRole('textbox', { name: /Which parts/ }));
    await user.paste('Mirror, Friday');
    await user.click(dialog.getByRole('button', { name: 'Move to Waiting for parts' }));
    expect(await screen.findByText(/Nothing has been charged yet/)).toBeInTheDocument();
    expect(job.queue).toBe('PARTS_WAITING');
    expect(job.reference).toBe('Mirror, Friday');
  });

  /**
   * A walk-in is a counter transaction: the rider pays for spare parts there
   * and then, only the unpaid balance reaches their weekly payment, labour is
   * never theirs, and there is no deposit to take it from — the bike is still
   * on the road with them.
   */
  it('charges a walk-in rider the unpaid spare parts only, and never offers the deposit', async () => {
    const job = seed();
    const user = userEvent.setup();
    show(`/service/assistance/${job.id}`, 'FLEET_ADMIN');
    expect(await screen.findByText('Walk-in & RSA')).toBeInTheDocument();
    const dialog = await fillWork(user);
    await user.click(dialog.getByRole('button', { name: 'Add a cost line' }));
    await user.type(dialog.getByRole('textbox', { name: 'Item 1' }), 'Brake pads');
    await user.type(dialog.getByRole('textbox', { name: 'Cost 1 (₹)' }), '500');
    await user.click(dialog.getByRole('button', { name: 'Send for Quality Check' }));

    await user.click(await screen.findByRole('button', { name: 'Do the Quality Check' }));
    const qc = within(await screen.findByRole('dialog'));
    expect(qc.getByText(/charged ₹500 in Weekly Payments/)).toBeInTheDocument();
    await user.clear(qc.getByRole('textbox', { name: 'Spare parts paid now (₹)' }));
    await user.type(qc.getByRole('textbox', { name: 'Spare parts paid now (₹)' }), '200');
    expect(qc.getByText(/charged ₹300 in Weekly Payments/)).toBeInTheDocument();

    await user.click(qc.getByRole('combobox', { name: 'Who pays?' }));
    expect(screen.getByRole('option', { name: 'Rider pays' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Take it from the deposit' })).not.toBeInTheDocument();
  });

  it('retains edited work after a failed save', async () => {
    const job = seed();
    vi.spyOn(api, 'updateServiceJob').mockRejectedValueOnce(new Error('Could not save job'));
    const user = userEvent.setup();
    show(`/service/assistance/${job.id}`);
    const dialog = await fillWork(user);
    await user.click(dialog.getByRole('button', { name: 'Send for Quality Check' }));
    expect(await dialog.findByText('Could not save job')).toBeInTheDocument();
    expect(dialog.getByRole('textbox', { name: 'What did you find, and what did you do?' })).toHaveValue('Mirror repaired and road tested');
    expect(job.workSummary).toBe('');
  });
});
