import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { SessionContext, type SessionValue } from '../../app/sessionContext';
import { serviceJobs } from '../../mocks/serviceJobs';
import { riders } from '../../mocks/riders';
import { vehicles } from '../../mocks/vehicles';
import { jobStage } from '../../lib/serviceWorkflow';
import type { UserRole } from '../../types';
import { LegacyJobList } from './LegacyJobList';
import { ServiceManagement } from './ServiceManagement';

const initialVehicles = structuredClone(vehicles);
const initialRiders = structuredClone(riders);
const initialJobs = structuredClone(serviceJobs);

/** Shows where "Back to jobs" would go, so a test can read it. */
function JobScreen() {
  const back = (useLocation().state as { returnTo?: string } | null)?.returnTo;
  return <div>job screen · back to {back}</div>;
}

function show(role: UserRole = 'FLEET_ADMIN', path = '/service/queues') {
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
            <Route path="/service/qc" element={<LegacyJobList />} />
            <Route path="/service/assistance/:jobId" element={<JobScreen />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </SessionContext.Provider>,
  );
}

/** Everything on one board, scoped by the board's own title. */
const board = (title: string) =>
  within(screen.getByRole('heading', { name: title }).closest('.MuiPaper-root') as HTMLElement);

afterEach(() => {
  vehicles.splice(0, vehicles.length, ...structuredClone(initialVehicles));
  riders.splice(0, riders.length, ...structuredClone(initialRiders));
  serviceJobs.splice(0, serviceJobs.length, ...structuredClone(initialJobs));
});

describe('Job Card Management', () => {
  it('splits the job cards between the two boards and counts each one', async () => {
    const walkIn = serviceJobs.filter((j) => j.category === 'WALK_IN_RSA');
    const hub = serviceJobs.filter((j) => j.category === 'HUB');
    // Both boards count in the same words the job page uses.
    const walkInRepair = walkIn.filter((j) => jobStage(j) === 'UNDER_REPAIR').length;
    const walkInClosed = walkIn.filter((j) => jobStage(j) === 'CLOSED').length;
    const underRepair = hub.filter((j) => jobStage(j) === 'UNDER_REPAIR').length;
    const qcPending = hub.filter((j) => jobStage(j) === 'QC_PENDING').length;
    // A board with nothing on it would pass every assertion below.
    expect(Math.min(walkInRepair, walkInClosed, underRepair, qcPending)).toBeGreaterThan(0);
    show();

    expect(await board('Walk-in & RSA').findByRole('group', { name: `Under Repair: ${walkInRepair}` })).toBeInTheDocument();
    expect(board('Walk-in & RSA').getByRole('group', { name: `Closed: ${walkInClosed}` })).toBeInTheDocument();
    expect(board('Hub Service').getByRole('group', { name: `Under Repair: ${underRepair}` })).toBeInTheDocument();
    expect(board('Hub Service').getByRole('group', { name: `QC Pending: ${qcPending}` })).toBeInTheDocument();

    // A rider's own job card never appears on the hub board, and the other way
    // round. Newest first, so both tickets are on the first page of their board.
    const newest = (rows: typeof walkIn) => [...rows].sort((a, b) => b.createdOn.localeCompare(a.createdOn))[0].id;
    const walkInTicket = newest(walkIn.filter((j) => j.status === 'OPEN'));
    const hubTicket = newest(hub.filter((j) => j.status !== 'CLOSED'));
    // The cards carry only the counts; each table opens in a pop-up over them.
    expect(screen.queryByText(walkInTicket)).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: `View Walk-in & RSA job cards (${walkIn.length})` }));
    let table = within(await screen.findByRole('dialog'));
    expect(table.getByText(walkInTicket)).toBeInTheDocument();
    expect(table.queryByText(hubTicket)).not.toBeInTheDocument();
    await user.click(table.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // Clicking anywhere on the card opens its board too.
    await user.click(screen.getByRole('heading', { name: 'Hub Service' }));
    table = within(await screen.findByRole('dialog'));
    expect(table.getByText(hubTicket)).toBeInTheDocument();
    expect(table.queryByText(walkInTicket)).not.toBeInTheDocument();
    // Status is information on both boards; it is changed on the job page, not here.
    expect(table.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('opens a job from its row in the pop-up, and the job page leads back to the same board', async () => {
    const job = serviceJobs.filter((j) => j.category === 'WALK_IN_RSA' && j.status !== 'CLOSED').sort((a, b) => b.createdOn.localeCompare(a.createdOn))[0];
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole('button', { name: /View Walk-in & RSA job cards/ }));
    const table = within(await screen.findByRole('dialog'));
    await user.click(await table.findByRole("button", { name: new RegExp(job.id) }));
    expect(await screen.findByText('job screen · back to /service/queues?board=walk-in')).toBeInTheDocument();
  });

  it('opening a new job card from the card does not also open the table', async () => {
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole('button', { name: 'Open Job Card' }));
    expect(await screen.findByRole('heading', { name: /Open Walk-in \/ RSA Job Card/ })).toBeInTheDocument();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('fills the bike in from the rider, and will not open a card without the executive and the remarks', async () => {
    // A bike with a card already open is refused, so pick a rider whose is clear.
    const rider = riders.find((r) => r.currentVehicleId
      && !serviceJobs.some((j) => j.vehicleId === r.currentVehicleId && j.status !== 'CLOSED'))!;
    const before = serviceJobs.length;
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole('button', { name: 'Open Job Card' }));

    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.queryByRole('combobox', { name: 'Eligible Inactive Vehicle (Returned / Recovery)' })).not.toBeInTheDocument();
    await user.click(await dialog.findByRole('combobox', { name: 'Active Rider' }));
    await user.click(await screen.findByRole('option', { name: `${rider.id} — ${rider.name}` }));
    expect(dialog.getByRole('textbox', { name: 'Vehicle ID' })).toHaveValue(rider.currentVehicleId);
    expect(dialog.getByRole('textbox', { name: 'Rider ID' })).toHaveValue(rider.id);

    // The button is never greyed out; it simply does not open a card yet.
    await user.click(dialog.getByRole('button', { name: 'Create Job Card' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(serviceJobs).toHaveLength(before);

    await user.click(dialog.getByRole('textbox', { name: 'Initial / Current Remarks' }));
    await user.paste('Brakes feel soft');
    await user.click(dialog.getByRole('button', { name: 'Create Job Card' }));
    expect(await screen.findByText(/opened for/)).toBeInTheDocument();
    expect(serviceJobs).toHaveLength(before + 1);
    expect(serviceJobs.at(-1)).toMatchObject({
      vehicleId: rider.currentVehicleId, riderId: rider.id, category: 'WALK_IN_RSA',
      createdBy: 'Demo operator', repairType: 'REPAIR_ONLY',
    });
  });

  it('offers the hub only bikes nobody is riding, and never asks for a rider', async () => {
    const returned = vehicles.find((v) => v.state === 'READY_TO_DEPLOY' && !v.currentRiderId
      && !serviceJobs.some((j) => j.vehicleId === v.id && j.status !== 'CLOSED'))!;
    returned.state = 'RETURNED';
    const stillRidden = vehicles.find((v) => v.state === 'DEPLOYED' && v.currentRiderId)!;
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole('button', { name: 'Open Hub Job Card' }));

    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.queryByRole('combobox', { name: 'Active Rider' })).not.toBeInTheDocument();
    expect(dialog.queryByRole('textbox', { name: 'Rider ID' })).not.toBeInTheDocument();
    await user.click(await dialog.findByRole('combobox', { name: 'Eligible Inactive Vehicle (Returned / Recovery)' }));
    expect(await screen.findByRole('option', { name: `${returned.id} — Returned` })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: new RegExp(stillRidden.id) })).not.toBeInTheDocument();
  });
  it('searches and filters a board by status, and clears both in one click', async () => {
    const walkIn = serviceJobs.filter((j) => j.category === 'WALK_IN_RSA');
    const target = walkIn.find((j) => jobStage(j) !== 'CLOSED')!;
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole('button', { name: /View Walk-in & RSA job cards/ }));
    const table = within(await screen.findByRole('dialog'));
    await table.findByRole('button', { name: new RegExp(target.id) });

    await user.type(table.getByRole('textbox', { name: 'Search job cards' }), target.vehicleId);
    expect(table.getByRole('button', { name: new RegExp(target.id) })).toBeInTheDocument();
    expect(table.getAllByRole('button', { name: /^J\d+/ })).toHaveLength(walkIn.filter((j) => j.vehicleId.includes(target.vehicleId)).length);

    // A status the found card is not in leaves nothing, with a way back.
    await user.click(table.getByRole('button', { name: /^Closed ·/ }));
    expect(await table.findByText('No job cards match')).toBeInTheDocument();
    await user.click(table.getByRole('button', { name: 'Clear filters' }));
    expect(table.getByRole('textbox', { name: 'Search job cards' })).toHaveValue('');
    expect(table.getAllByRole('button', { name: /^J\d+/ }).length).toBeGreaterThan(1);
  });

  it('opens a board already filtered when a count on its card is clicked', async () => {
    const qc = serviceJobs.filter((j) => j.category === 'HUB' && jobStage(j) === 'QC_PENDING');
    expect(qc.length).toBeGreaterThan(0);
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole('button', { name: `Show QC Pending job cards (${qc.length})` }));
    const table = within(await screen.findByRole('dialog'));
    expect(table.getByRole('heading', { name: 'Hub Service' })).toBeInTheDocument();
    expect(table.getByRole('button', { name: `QC Pending · ${qc.length}` })).toHaveAttribute('aria-pressed', 'true');
    expect(await table.findAllByRole('button', { name: /^J\d+/ })).toHaveLength(qc.length);
  });

  it('sends the old QC queue address to all job cards, filtered to QC Pending', async () => {
    const qc = serviceJobs.filter((j) => jobStage(j) === 'QC_PENDING');
    show('FLEET_ADMIN', '/service/qc');
    const table = within(await screen.findByRole('dialog'));
    expect(table.getByRole('heading', { name: 'All job cards' })).toBeInTheDocument();
    expect(await table.findAllByRole('button', { name: /^J\d+/ })).toHaveLength(qc.length);
  });
});
