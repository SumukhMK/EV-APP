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
  await user.click(screen.getByRole('textbox', { name: 'Repaired by (Technician)' }));
  await user.paste('Ravi');
}
async function addPart(user: ReturnType<typeof userEvent.setup>, label: string, cost: string) {
  await user.click(screen.getByRole('button', { name: 'Add part' }));
  const parts = screen.getAllByRole('textbox', { name: 'Part' });
  await user.type(parts[parts.length - 1], label);
  const costs = screen.getAllByRole('textbox', { name: '₹' });
  await user.type(costs[costs.length - 1], cost);
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


  it('saves parts and technician on the job card in place, with nothing charged', async () => {
    const job = seed();
    const user = userEvent.setup();
    show(`/service/assistance/${job.id}`, 'FLEET_STAFF');
    expect(await screen.findByRole('link', { name: 'Give another bike' })).toHaveAttribute('href', `/assignments/exchange?riderId=${job.riderId}`);
    await fillWork(user);
    await addPart(user, 'Mirror', '300');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/Nothing has been charged yet/)).toBeInTheDocument();
    expect(job.items).toEqual([{ label: 'Mirror', costPaise: 30000, kind: 'PART' }]);
    expect(job.technician).toBe('Ravi');
    expect(job.status).toBe('IN_PROGRESS');
    expect(riderCharges).toHaveLength(0);
  });

  it('removes a part line and saves the shorter list', async () => {
    const job = seed();
    updateServiceJobRecord({ jobId: job.id, queue: 'MINOR_REPAIR', damageCategory: 'MINOR', workSummary: '', items: [{ label: 'Mirror', costPaise: 30000, kind: 'PART' }, { label: 'Horn', costPaise: 10000, kind: 'PART' }], technician: null, liability: null, reference: null, note: 'Parts listed', actor: 'Desk' });
    const user = userEvent.setup();
    show(`/service/assistance/${job.id}`);
    await user.click(await screen.findByRole('button', { name: 'Remove line 2' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/Nothing has been charged yet/)).toBeInTheDocument();
    expect(job.items.map((i) => i.label)).toEqual(['Mirror']);
  });

  it('lets the service manager hand the work to QC but not pass QC or decide who pays', async () => {
    const job = seed();
    const user = userEvent.setup();
    show(`/service/assistance/${job.id}`, 'SERVICE_MANAGER');
    await fillWork(user);
    expect(screen.queryByRole('button', { name: 'Pass QC & close ticket' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Who pays?' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Work done — send for QC' }));
    expect(await screen.findByText(/Waiting for fleet staff/)).toBeInTheDocument();
    expect(job.queue).toBe('QC_PENDING');
  });

  it('passes QC and closes the ticket in one press, with one charge', { timeout: 15_000 }, async () => {
    const job = seed();
    const user = userEvent.setup();
    show(`/service/assistance/${job.id}`, 'FLEET_ADMIN');
    await fillWork(user);
    await addPart(user, 'Mirror', '5000.01');
    expect(screen.getByText(/over ₹5,000/)).toBeInTheDocument();
    // Closing with checks missing shakes and saves nothing.
    await user.click(screen.getByRole('button', { name: 'Pass QC & close ticket' }));
    expect(screen.getByText('Tick every QC check first.')).toBeInTheDocument();
    expect(job.status).toBe('OPEN');
    await user.click(screen.getByRole('button', { name: 'Check all' }));
    await user.click(screen.getByRole('button', { name: 'Pass QC & close ticket' }));
    expect(await screen.findByText(/This job is finished/)).toBeInTheDocument();
    expect(job.status).toBe('CLOSED');
    expect(riderCharges).toHaveLength(1);
    expect(riderCharges[0].amount).toBe(500001);
    expect(job.technician).toBe('Ravi');
    expect(job.workSummary).toBe('Mirror');
  });

  it('blocks invalid cost lines', async () => {
    const job = seed();
    const user = userEvent.setup();
    show(`/service/assistance/${job.id}`);
    await fillWork(user);
    await addPart(user, 'Mirror', '-5');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(job.status).toBe('OPEN');
    expect(screen.getByText(/Every part or repair line needs/)).toBeInTheDocument();
    const cost = screen.getByRole('textbox', { name: '₹' });
    await user.clear(cost);
    await user.type(cost, '200');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/Nothing has been charged yet/)).toBeInTheDocument();
  });

  it('opens the existing job from inspection instead of requiring the vehicle-detail hop', async () => {
    const job = seed();
    show(`/service/inspection?vehicle=${job.vehicleId}`);
    expect(await screen.findByText(`${job.vehicleId} · ${job.id}`)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Work done — send for QC' })).toBeInTheDocument();
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
    expect(screen.queryByRole('textbox', { name: 'Repaired by (Technician)' })).not.toBeInTheDocument();
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

  it('marks a job Parts Waiting from the card, and asks which parts first', async () => {
    const job = seed();
    const user = userEvent.setup();
    show(`/service/assistance/${job.id}`);
    await user.click(await screen.findByRole('button', { name: 'Parts Waiting' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(job.queue).not.toBe('PARTS_WAITING');
    expect(screen.getByText('Say which parts you are waiting for.')).toBeInTheDocument();
    await user.click(screen.getByRole('textbox', { name: /Which parts/ }));
    await user.paste('Mirror, Friday');
    await user.click(screen.getByRole('button', { name: 'Save' }));
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
    await fillWork(user);
    await addPart(user, 'Brake pads', '500');
    expect(screen.getByText(/charged ₹500 in Weekly Payments/)).toBeInTheDocument();
    const paid = screen.getByRole('textbox', { name: 'Spare parts paid now (₹)' });
    await user.clear(paid);
    await user.type(paid, '200');
    expect(screen.getByText(/charged ₹300 in Weekly Payments/)).toBeInTheDocument();
    const payers = within(screen.getByRole('group', { name: 'Who pays?' }));
    expect(payers.getByRole('button', { name: 'Rider' })).toBeInTheDocument();
    expect(payers.queryByRole('button', { name: 'Deposit' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Check all' }));
    await user.click(screen.getByRole('button', { name: 'Pass QC & close ticket' }));
    expect(await screen.findByText(/This job is finished/)).toBeInTheDocument();
    expect(riderCharges).toHaveLength(1);
    expect(riderCharges[0].amount).toBe(30000);
  });

  it('retains edited work after a failed save', async () => {
    const job = seed();
    vi.spyOn(api, 'updateServiceJob').mockRejectedValueOnce(new Error('Could not save job'));
    const user = userEvent.setup();
    show(`/service/assistance/${job.id}`);
    await fillWork(user);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Could not save job')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Repaired by (Technician)' })).toHaveValue('Ravi');
    expect(job.technician).toBe(null);
  });
});
