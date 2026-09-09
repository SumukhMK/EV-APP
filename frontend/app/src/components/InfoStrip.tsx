import Box from '@mui/material/Box';
import type { ReactNode } from 'react';
import { status } from '../theme/tokens';

/**
 * A rule, stated where it applies.
 *
 * Phase 1 says: nothing invented where a rule is unknown — show the field, add
 * a visible note, leave the logic out. Those notes are the record of what we
 * were told and what we refused to guess, so they get one consistent
 * treatment rather than a stray line of grey text per screen.
 */
export function InfoStrip({
  children,
  tone = 'accent',
}: {
  children: ReactNode;
  tone?: 'accent' | 'caution';
}) {
  const { fg, bg } = status[tone];
  return (
    <Box
      sx={{
        background: bg,
        color: fg,
        borderRadius: 2,
        p: '10px 14px',
        fontSize: 13,
        lineHeight: 1.6,
      }}
    >
      {children}
    </Box>
  );
}
