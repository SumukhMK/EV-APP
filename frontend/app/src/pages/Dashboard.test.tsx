import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Dashboard } from './Dashboard';
import { SessionContext, type SessionValue } from '../app/sessionContext';
import type { FleetSummary, MonthlyDeployments } from '../types';

const { getFleetSummary, getMonthlyDeployments } = vi.hoisted(() => ({
  getFleetSummary: vi.fn<() => Promise<FleetSummary>>(),
  getMonthlyDeployments: vi.fn<() => Promise<MonthlyDeployments[]>>(),
}));

vi.mock('../lib/api/dashboard', () => ({ getFleetSummary, getMonthlyDeployments }));

const summary: FleetSummary = {
  totalFleet: 100,
  deployed: 60,
  readyToDeploy: 20,
  underRepair: 10,
  qcPending: 5,
  accident: 2,
  recovery: 3,
  overdueRiders: 7,
  overdueValue: 1234500,
};

function renderDashboard(roleKey: SessionValue['user']['roleKey']) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const session: SessionValue = {
    user: { name: 'Test User', email: 'test@example.com', roleKey },
    tenant: 'Test Tenant',
    personas: [],
    signedIn: true,
    restoring: false,
    signIn: vi.fn(),
    signOut: vi.fn(),
    switchPersona: vi.fn(),
  };

  return render(
    <QueryClientProvider client={queryClient}>
      <SessionContext.Provider value={session}>
        <MemoryRouter><Dashboard /></MemoryRouter>
      </SessionContext.Provider>
    </QueryClientProvider>,
  );
}

describe('Dashboard role-specific tiles', () => {
  beforeEach(() => {
    getFleetSummary.mockResolvedValue(summary);
    getMonthlyDeployments.mockResolvedValue([]);
  });

  it.each(['SUPER_ADMIN', 'FLEET_ADMIN'] as const)('shows payment tiles to %s', async (role) => {
    renderDashboard(role);
    expect(await screen.findByText('Riders behind on rent')).toBeInTheDocument();
    expect(screen.getByText('Money owed')).toBeInTheDocument();
  });

  it.each(['FLEET_STAFF', 'SERVICE_MANAGER'] as const)('hides payment tiles from %s', async (role) => {
    renderDashboard(role);
    expect(await screen.findByText('Total fleet')).toBeInTheDocument();
    expect(screen.getByText('In Service')).toBeInTheDocument();
    expect(screen.queryByText('Riders behind on rent')).not.toBeInTheDocument();
    expect(screen.queryByText('Money owed')).not.toBeInTheDocument();
  });
});
