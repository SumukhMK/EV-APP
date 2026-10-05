import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

/**
 * A titled surface. The label is the same tracked-out `overline` as PageHeader.
 *
 * `locked` is for a panel whose fields only make sense once an earlier
 * choice is made — the return condition before a rider is picked, the
 * problem before a bike is picked. The panel stays visible so the operator
 * sees what is coming, but its contents cannot be focused, typed into or
 * clicked (`inert`), they are dimmed, and the reason sits under the title:
 * "Pick the rider first". Nothing is pre-filled behind a lock, so a form
 * cannot carry a value the operator never chose for that subject.
 */
/**
 * The lock on its own, for fields that share a panel with the choice they
 * depend on (the problem fields under the bike picker on the new-job
 * screen). Same rule as a locked Panel: inert, dimmed, with the reason.
 */
export function Locked({
  locked,
  children,
  sx,
}: {
  locked?: string | false | null;
  children: ReactNode;
  /** Layout for the locked body, so children laid out by a parent grid keep their spacing. */
  sx?: React.ComponentProps<typeof Box>['sx'];
}) {
  if (!locked) {
    return children;
  }
  return (
    <Box>
      <Typography role="note" sx={{ fontSize: 13, color: 'warning.main', mb: 3 }}>
        {locked}
      </Typography>
      <Box
        inert
        aria-disabled
        sx={[{ opacity: 0.45, filter: 'grayscale(0.4)', pointerEvents: 'none', userSelect: 'none' }, ...(Array.isArray(sx) ? sx : [sx])]}
      >
        {children}
      </Box>
    </Box>
  );
}

export function Panel({
  label,
  subtitle,
  action,
  children,
  sx,
  locked,
}: {
  label?: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  sx?: React.ComponentProps<typeof Paper>['sx'];
  /** When set, the body is inert and dimmed, and this sentence says why. */
  locked?: string | false | null;
}) {
  return (
    <Paper sx={[{ p: { xs: '16px 14px 14px', sm: '18px 20px 16px' } }, ...(Array.isArray(sx) ? sx : [sx])]}>
      {(label || action) && (
        <Box
          sx={{
            display: 'flex',
            // The action drops below the label on a narrow panel; side by side
            // it squeezes a two-word subtitle onto four lines.
            flexDirection: { xs: 'column', sm: 'row' },
            alignItems: { xs: 'flex-start', sm: 'flex-end' },
            justifyContent: 'space-between',
            gap: { xs: 2, sm: 4 },
            mb: subtitle ? 4 : 3,
          }}
        >
          <Box>
            {label && <Typography variant="overline">{label}</Typography>}
            {subtitle && (
              <Typography sx={{ fontSize: 14, color: 'grey.400', mt: '3px' }}>{subtitle}</Typography>
            )}
            {locked && (
              <Typography role="note" sx={{ fontSize: 13, color: 'warning.main', mt: 1 }}>
                {locked}
              </Typography>
            )}
          </Box>
          {action}
        </Box>
      )}
      {locked ? (
        <Box inert aria-disabled sx={{ opacity: 0.45, filter: 'grayscale(0.4)', pointerEvents: 'none', userSelect: 'none' }}>
          {children}
        </Box>
      ) : (
        children
      )}
    </Paper>
  );
}
