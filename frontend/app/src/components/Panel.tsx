import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

/** A titled surface. The label is the same tracked-out `overline` as PageHeader. */
export function Panel({
  label,
  subtitle,
  action,
  children,
  sx,
}: {
  label?: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  sx?: React.ComponentProps<typeof Paper>['sx'];
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
          </Box>
          {action}
        </Box>
      )}
      {children}
    </Paper>
  );
}
