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
    <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, columnGap: 8 }}>
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
