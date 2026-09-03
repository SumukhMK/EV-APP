import Box from '@mui/material/Box';
import type { ReactNode } from 'react';
import { neutral } from '../theme/tokens';

export interface Definition {
  label: string;
  value: ReactNode;
}

/**
 * Label-on-the-left, value-on-the-right rows under a hairline. Used for every
 * spec panel and summary card, so the two never drift apart visually.
 */
export function DefinitionList({
  items,
  columns = 1,
  divider = 'bottom',
}: {
  items: Definition[];
  columns?: 1 | 2;
  /** `top` puts the rule above each row, which suits a panel that opens with a heading block. */
  divider?: 'top' | 'bottom';
}) {
  return (
    <Box
      sx={{
        display: 'grid',
        // A two-column definition list collapses to one below sm, where
        // label and value would otherwise meet in the middle.
        gridTemplateColumns: { xs: '1fr', sm: `repeat(${columns}, 1fr)` },
        columnGap: 8,
        // And it stops growing on a wide panel. A label pinned to the left of
        // a 1100px row and its value pinned to the right stop reading as a
        // pair; the eye has to travel too far to connect them.
        maxWidth: columns * 460,
      }}
    >
      {items.map((d) => (
        <Box
          key={d.label}
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 4,
            py: 2,
            [divider === 'top' ? 'borderTop' : 'borderBottom']: `1px solid ${neutral[900]}`,
          }}
        >
          <Box component="span" sx={{ fontSize: 13, color: neutral[400] }}>
            {d.label}
          </Box>
          <Box component="span" sx={{ fontSize: 13, textAlign: 'right' }}>
            {d.value}
          </Box>
        </Box>
      ))}
    </Box>
  );
}
