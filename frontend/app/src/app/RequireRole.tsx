import type { ReactNode } from 'react';
import Button from '@mui/material/Button';
import { Link, useLocation } from 'react-router-dom';
import { EmptyState } from '../components/EmptyState';
import { USER_ROLE_LABEL } from '../lib/labels';
import { rolesForPath } from './nav';
import { useSession } from './sessionContext';

/**
 * The role gate on a route, the other half of what the rail already does.
 *
 * `navForRole` hides a section a role has no business in, but hiding a link is
 * not closing a door: until this existed, a fleet hand who typed `/payments/
 * overdue` got the whole overdue book — every rider's name, phone number and
 * outstanding amount — and `/users` and `/audit` opened just as widely. The
 * rail and this gate now read the same table in `nav.ts`, so a section that is
 * hidden is also shut.
 *
 * Unlike `RequireSession` this applies in the demo build too. A walkthrough
 * that switches to the service manager to show "the workshop never sees the
 * money screens" should not be contradicted by the address bar; and the demo
 * keeps its own escape hatch, because switching back to the admin persona is
 * one click in the rail.
 *
 * Still not security. The API is the gate that counts — every screen behind
 * this one asks the server for its data, and the server answers to the token,
 * not to the route. This stops the client asking questions it already knows
 * the answer to, and stops a URL leaking a screenful of data on the way.
 */
export function RequireRole({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const { pathname } = useLocation();

  const allowed = rolesForPath(pathname);
  if (!allowed || allowed.includes(user.roleKey)) return children;

  return (
    <EmptyState
      title="Not available for your role"
      description={`This screen is not part of what a ${USER_ROLE_LABEL[user.roleKey].toLowerCase()} does. If you need it, ask an administrator to change your role.`}
      action={
        <Button component={Link} to="/dashboard" variant="outlined">
          Back to dashboard
        </Button>
      }
    />
  );
}
