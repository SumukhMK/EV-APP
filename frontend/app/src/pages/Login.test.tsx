import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Login } from './Login';
import { SessionContext, type SessionValue } from '../app/sessionContext';
import { ApiError } from '../lib/api/client';

function renderLogin(signIn: SessionValue['signIn']) {
  const session: SessionValue = {
    user: { name: 'Meenakshi Iyer', roleKey: 'FLEET_ADMIN', email: 'meenakshi@g1mobility.in' },
    tenant: 'G1 Mobility Rentals',
    personas: [],
    signedIn: false,
    restoring: false,
    signIn,
    signOut: vi.fn(),
    switchPersona: vi.fn(),
  };
  return render(
    <MemoryRouter>
      <SessionContext.Provider value={session}>
        <Login />
      </SessionContext.Provider>
    </MemoryRouter>,
  );
}

describe('Login', () => {
  it('passes what was typed to the session, not a hardcoded account', async () => {
    const signIn = vi.fn().mockResolvedValue(undefined);
    renderLogin(signIn);

    await userEvent.clear(screen.getByLabelText(/email/i));
    await userEvent.type(screen.getByLabelText(/email/i), 'dhananjay@g1mobility.in');
    await userEvent.clear(screen.getByLabelText(/password/i));
    await userEvent.type(screen.getByLabelText(/password/i), 'hunter2');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(signIn).toHaveBeenCalledWith('dhananjay@g1mobility.in', 'hunter2');
  });

  it('stays on the form and says so when the credentials are rejected', async () => {
    renderLogin(vi.fn().mockRejectedValue(new ApiError('Invalid email or password', 401)));
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/incorrect/i));
    // Rejected, not stuck: the button must be usable for a second attempt.
    expect(screen.getByRole('button', { name: /sign in/i })).toBeEnabled();
  });

  it('reports a server that is simply unreachable differently', async () => {
    renderLogin(vi.fn().mockRejectedValue(new Error('Failed to fetch')));
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/could not sign in/i));
  });

  it('does not fire a second sign-in while the first is in flight', async () => {
    const signIn = vi.fn().mockImplementation(() => new Promise(() => {}));
    renderLogin(signIn);

    const button = screen.getByRole('button', { name: /sign in/i });
    await userEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    expect(signIn).toHaveBeenCalledOnce();
  });
});
