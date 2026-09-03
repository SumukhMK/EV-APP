import Box from '@mui/material/Box';
import { status as statusTokens, type StatusTone } from '../theme/tokens';

/**
 * The one way a status is drawn anywhere in the product. Takes a resolved
 * label and tone — the enum→label mapping lives in src/lib/labels.ts, so a
 * screen can never invent its own wording or its own colour.
 */
export function StateChip({ label, tone = 'neutral' }: { label: string; tone?: StatusTone }) {
  const { fg, bg } = statusTokens[tone];
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-block',
        fontSize: 11,
        lineHeight: 1.5,
        px: 2,
        py: '2px',
        borderRadius: '4px',
        whiteSpace: 'nowrap',
        color: fg,
        backgroundColor: bg,
      }}
    >
      {label}
    </Box>
  );
}
