import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { Navigate, useLocation } from 'react-router-dom';
import { useSession } from './sessionContext';
import { IS_LIVE } from '../lib/api/client';

/**
 * The route gate, and only in live mode.
 *
 * The demo build leaves every route reachable by URL on purpose, so a
 * walkthrough never hits a wall. Against a real API that would instead mean
 * a rail drawn around screens whose every request is a 401 — so an
 * unauthenticated visitor is sent to the login screen.
 *
 * This is convenience, not security. The API enforces access; this only keeps
 * the client from asking questions it already knows the answer to.
 */
export function RequireSession({ children }: { children: ReactNode }) {
  const { signedIn, restoring } = useSession();
  const location = useLocation();

  if (!IS_LIVE) return children;

  // A stored token is still being checked. Redirecting now would bounce a
  // perfectly valid session to /login on every reload.
  if (restoring) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (!signedIn) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  return children;
}
