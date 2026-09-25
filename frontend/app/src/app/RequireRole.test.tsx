import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { UserRole } from '../types';
import { rolesForPath } from './nav';
import { RequireRole } from './RequireRole';
import { SessionContext, type SessionValue } from './sessionContext';

/**
 * The route gate, tested from both ends.
 *
 * `rolesForPath` is the table — one place that says who may open a path, shared
 * with the rail so a hidden section and an open URL cannot disagree.
 * `RequireRole` is the gate that reads it. RBAC.md §1 is the specification both
 * are checked against; §5 listed "routes are not hard-gated" as the go-live gap
 * these close.
 */

const NAMES: Record<UserRole, string> = {
  SUPER_ADMIN: 'Priya Menon',
  FLEET_ADMIN: 'Meenakshi Iyer',
  FLEET_STAFF: 'Dhananjay',
  SERVICE_MANAGER: 'Abhinandan',
};

function renderAt(path: string, role: UserRole) {
  const session: SessionValue = {
    user: { name: NAMES[role], roleKey: role, email: 'demo@g1mobility.in' },
    tenant: 'G1 Mobility',
    personas: [],
    signedIn: true,
    restoring: false,
    signIn: vi.fn(),
    signOut: vi.fn(),
    switchPersona: vi.fn(),
  };
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SessionContext.Provider value={session}>
        <Routes>
          <Route
            path="*"
            element={
              <RequireRole>
                <div>screen content</div>
              </RequireRole>
            }
          />
        </Routes>
      </SessionContext.Provider>
    </MemoryRouter>,
  );
}

const SA: UserRole = 'SUPER_ADMIN';
const FA: UserRole = 'FLEET_ADMIN';
const FS: UserRole = 'FLEET_STAFF';
const SM: UserRole = 'SERVICE_MANAGER';

describe('rolesForPath', () => {
  // RBAC.md §1, the rows where the four roles do not all agree.
  it.each([
    ['/users', [SA, FA]],
    ['/audit', [SA, FA]],
    ['/payments/run', [SA, FA]],
    ['/payments/run/R44', [SA, FA]],
    ['/payments/overdue', [SA, FA]],
    ['/recovery', [SA, FA]],
    ['/riders', [SA, FA, FS]],
    ['/riders/onboard', [SA, FA, FS]],
    ['/riders/R44', [SA, FA, FS]],
    ['/assignments/assign', [SA, FA, FS]],
    ['/assignments/exchange', [SA, FA, FS]],
    ['/assignments/deboard', [SA, FA, FS]],
    ['/vehicles/new', [SA, FA, FS]],
    ['/vehicles/bulk-upload', [SA, FA, FS]],
    ['/vehicles/BLRSS0407/edit', [SA, FA]],
  ])('gates %s to %s', (path, roles) => {
    expect(rolesForPath(path)?.slice().sort()).toEqual(roles.slice().sort());
  });

  // The rows every role shares stay open, so the table never becomes a second
  // place to remember to add a screen to.
  it.each([
    '/dashboard',
    '/operations/today',
    '/vehicles',
    '/vehicles/BLRSS0407',
    '/service/queues',
    '/service/qc',
    '/service/inspection',
    '/service/assistance',
    '/service/assistance/new',
    '/service/assistance/J12',
  ])('leaves %s open to every role', (path) => {
    expect(rolesForPath(path)).toBeNull();
  });

  it('leaves the dev tools ungated — they are tooling, not product', () => {
    expect(rolesForPath('/design-tokens')).toBeNull();
    expect(rolesForPath('/flows')).toBeNull();
  });

  it('matches the detail route, not the edit route, for a bare vehicle id', () => {
    // `/vehicles/:id` is open to all four; `/vehicles/:id/edit` is not. A table
    // that matched on prefix alone would hand SM the edit screen.
    expect(rolesForPath('/vehicles/BLRSS0407')).toBeNull();
    expect(rolesForPath('/vehicles/BLRSS0407/edit')).toEqual([SA, FA]);
  });
});

describe('RequireRole', () => {
  it.each([
    ['/users', FS],
    ['/users', SM],
    ['/audit', FS],
    ['/audit', SM],
    ['/payments/overdue', FS],
    ['/payments/run', SM],
    ['/recovery', FS],
    ['/riders', SM],
    ['/assignments/deboard', SM],
    ['/vehicles/new', SM],
    ['/vehicles/BLRSS0407/edit', FS],
  ])('keeps %s shut for %s', (path, role) => {
    renderAt(path, role);
    expect(screen.queryByText('screen content')).not.toBeInTheDocument();
    expect(screen.getByText(/not available for your role/i)).toBeInTheDocument();
  });

  it.each([
    ['/users', FA],
    ['/users', SA],
    ['/payments/run', FA],
    ['/riders', FS],
    ['/vehicles/new', FS],
    ['/vehicles/BLRSS0407/edit', FA],
    ['/dashboard', SM],
    ['/service/qc', FS],
    ['/vehicles/BLRSS0407', SM],
  ])('opens %s for %s', (path, role) => {
    renderAt(path, role);
    expect(screen.getByText('screen content')).toBeInTheDocument();
  });

  it('names the role it refused, so the message is actionable', () => {
    renderAt('/users', FS);
    expect(screen.getByText(/fleet staff/i)).toBeInTheDocument();
  });
});
