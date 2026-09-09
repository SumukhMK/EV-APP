import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Link } from 'react-router-dom';
import { neutral } from '../theme/tokens';

export interface NumberedListRow {
  label: string;
  /** The trail behind the label, e.g. "Under repair · Major". */
  hint: string;
  to?: string;
}

/**
 * Label-and-trail rows: a thing, and where it came from.
 *
 * The prototype's part-usage list spells out what it is reaching for — "Part →
 * Usage → Vehicle → Service Ticket / Job Card". Until those links exist the
 * row can only state the trail; the shape is here so that when they do, the
 * row becomes a link and nothing else changes.
 */
export function NumberedList({ rows }: { rows: readonly NumberedListRow[] }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
      {rows.map((r) => (
        <Box
          key={r.label}
          {...(r.to ? { component: Link, to: r.to } : {})}
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: 3,
            py: 3,
            color: 'inherit',
            textDecoration: 'none',
            borderTop: `1px solid ${neutral[900]}`,
            '&:first-of-type': { borderTop: 'none' },
            '&:hover': r.to ? { background: neutral[900] } : undefined,
          }}
        >
          <Typography sx={{ fontSize: 14 }}>{r.label}</Typography>
          <Typography sx={{ fontSize: 12, color: 'grey.500' }}>{r.hint}</Typography>
        </Box>
      ))}
    </Box>
  );
}
