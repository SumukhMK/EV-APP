import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { neutral } from '../theme/tokens';

/**
 * The header band every screen opens with: a tracked-out section label, the
 * screen title, and the screen's actions on the right, over a hairline rule.
 */
export function PageHeader({
  section,
  title,
  actions,
  meta,
}: {
  section: string;
  title: ReactNode;
  actions?: ReactNode;
  /** Right-hand text used where a screen has no actions, e.g. the clock on the dashboard. */
  meta?: ReactNode;
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        // Stacks below sm so a long title and three actions do not squeeze
        // each other into two words per line.
        flexDirection: { xs: 'column', sm: 'row' },
        alignItems: { xs: 'flex-start', sm: 'flex-end' },
        justifyContent: 'space-between',
        gap: { xs: 4, sm: 6 },
        pt: 6,
        pb: 3.5,
        borderBottom: `1px solid ${neutral[900]}`,
      }}
    >
      <Box>
        <Typography variant="overline">{section}</Typography>
        <Typography variant="h3" sx={{ mt: '2px', fontSize: { xs: 22, sm: 25, xl: 28 } }}>
          {title}
        </Typography>
      </Box>
      {actions ? (
        <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', rowGap: 2 }}>
          {actions}
        </Stack>
      ) : null}
      {meta}
    </Box>
  );
}
