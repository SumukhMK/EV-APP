import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { FleetNav } from './FleetNav';
import { SessionContext, type SessionValue } from '../app/sessionContext';

function renderNav(signOut: SessionValue['signOut'], collapsed = false) {
  const session: SessionValue = {
    user: { name: 'Meenakshi Iyer', roleKey: 'FLEET_ADMIN', email: 'meenakshi@g1mobility.in' },
    tenant: 'G1 Mobility Rentals',
    personas: [],
    signedIn: true,
    restoring: false,
    signIn: vi.fn(),
    signOut,
    switchPersona: vi.fn(),
  };
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <SessionContext.Provider value={session}>
        <Routes>
          <Route path="/dashboard" element={<FleetNav collapsed={collapsed} />} />
          <Route path="/login" element={<div>login page</div>} />
        </Routes>
      </SessionContext.Provider>
    </MemoryRouter>,
  );
}

describe('FleetNav', () => {
  it('signs out only after the dialog is confirmed, then returns to login', async () => {
    const signOut = vi.fn();
    renderNav(signOut);

    // The rail button only opens the gate — nothing has happened yet.
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(signOut).not.toHaveBeenCalled();
    expect(screen.getByText(/your session will end/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Yes, sign out' }));

    expect(signOut).toHaveBeenCalledOnce();
    expect(screen.getByText('login page')).toBeInTheDocument();
  });

  it('cancelling the dialog keeps the session and the screen', async () => {
    const signOut = vi.fn();
    renderNav(signOut);

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(signOut).not.toHaveBeenCalled();
    expect(screen.queryByText('login page')).not.toBeInTheDocument();
  });

  it('offers the same gate in the collapsed rail', async () => {
    const signOut = vi.fn();
    renderNav(signOut, true);

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, sign out' }));

    expect(signOut).toHaveBeenCalledOnce();
  });
});