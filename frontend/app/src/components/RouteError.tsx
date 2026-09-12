import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { isRouteErrorResponse, useRouteError } from 'react-router-dom';
import { PageHeader } from './PageHeader';
import { neutral } from '../theme/tokens';

/**
 * The floor under a thrown render, so one bad screen is a panel and not a
 * white page with the rail gone.
 *
 * The case this exists for in production is not a logic bug — it is a deploy.
 * Routes are code-split with hashed filenames, so a tab left open across a
 * release asks for a chunk that no longer exists, and the import rejects. That
 * is recoverable by definition: reload and the new manifest is fetched. Any
 * other error is not, so the panel offers the dashboard as well.
 */
export function RouteError() {
  const error = useRouteError();

  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'Something went wrong rendering this screen.';

  // A failed dynamic import is almost always a stale tab against a new deploy.
  const isStaleChunk =
    error instanceof Error && /dynamically imported module|Importing a module script failed/i.test(error.message);

  return (
    <>
      <PageHeader section="Error" title={isStaleChunk ? 'This tab is out of date' : 'This screen failed to load'} />
      <Paper sx={{ mt: 5, p: 8, borderStyle: 'dashed', borderColor: neutral[800] }}>
        <Typography sx={{ fontSize: 15, maxWidth: 640 }}>
          {isStaleChunk
            ? 'A new version of FleeTech has been released since this tab was opened. Reloading will pick it up — nothing has been lost.'
            : message}
        </Typography>
        <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 4 }}>
          The rest of the app is still running. Reload this screen, or go back to the dashboard.
        </Typography>
        <Button onClick={() => window.location.reload()} sx={{ mt: 5, mr: 2 }}>
          Reload
        </Button>
        <Button color="inherit" onClick={() => { window.location.href = '/dashboard'; }} sx={{ mt: 5 }}>
          Back to dashboard
        </Button>
      </Paper>
    </>
  );
}
