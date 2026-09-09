import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { base } from '../theme/tokens';

export interface SummaryItem {
  label: string;
  value: ReactNode;
}

/**
 * What was just picked, and what follows from it.
 *
 * On an exchange or a deboard the operator picks a rider and the consequences
 * are elsewhere on the form — which bike comes back, what it is worth, what is
 * owed. This puts them in one line above the commit button, which is the last
 * place a wrong pick can still be caught. With no items it shows the prompt,
 * so the space does not jump when the pick lands.
 */
export function SelectionSummary({
  title,
  hint,
  items,
}: {
  title: string;
  hint?: string;
  items?: readonly SummaryItem[];
}) {
  return (
    <Box sx={{ background: base.surface, borderRadius: 2, p: '14px 16px 12px' }}>
      <Typography sx={{ fontSize: 15 }}>{title}</Typography>
      {hint && <Typography sx={{ fontSize: 13, color: 'grey.500', mt: '2px' }}>{hint}</Typography>}
      {items && items.length > 0 && (
        <Box
          sx={{
            mt: 3,
            display: 'grid',
            gridTemplateColumns: { xs: '1fr 1fr', md: `repeat(${Math.min(items.length, 4)}, 1fr)` },
            gap: 3,
          }}
        >
          {items.map((i) => (
            <Box key={i.label}>
              <Typography variant="overline">{i.label}</Typography>
              <Box sx={{ fontSize: 14, mt: '2px' }}>{i.value}</Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
