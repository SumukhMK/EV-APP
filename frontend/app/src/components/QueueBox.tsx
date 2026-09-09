import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Link } from 'react-router-dom';
import { Mono } from './Mono';
import { base, neutral, status, type StatusTone } from '../theme/tokens';

export interface QueueRow {
  label: string;
  count: number;
  tone?: StatusTone;
  /** Where the count leads — a row that counts a set must open that set. */
  to: string;
}

/**
 * A named group of work queues, each with its size.
 *
 * Service Management and Recovery Summary are both this shape: a heading over
 * a stack of "what is stuck here, and how much of it". Sixteen such rows
 * across four boxes, so they get one component rather than four hand-built
 * lists that drift apart on the second change of mind. Rows are anchors, not
 * click handlers — the count is a promise the operator can middle-click.
 */
export function QueueBox({ heading, rows }: { heading: string; rows: readonly QueueRow[] }) {
  return (
    <Box sx={{ background: base.surface, borderRadius: 2, p: '16px 18px 14px' }}>
      <Typography variant="overline">{heading}</Typography>
      <Box sx={{ mt: 3, display: 'flex', flexDirection: 'column' }}>
        {rows.map((r) => (
          <Box
            key={r.label}
            component={Link}
            to={r.to}
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 3,
              py: 3,
              px: 2,
              mx: -2,
              borderRadius: 1,
              color: 'inherit',
              textDecoration: 'none',
              borderTop: `1px solid ${neutral[900]}`,
              '&:first-of-type': { borderTop: 'none' },
              '&:hover': { background: neutral[900] },
            }}
          >
            <Typography sx={{ fontSize: 13 }}>{r.label}</Typography>
            <Mono sx={{ fontSize: 16, color: r.tone ? status[r.tone].fg : 'text.primary' }}>
              {r.count}
            </Mono>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
