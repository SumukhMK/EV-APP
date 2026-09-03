import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { base, neutral, status, type StatusTone } from '../theme/tokens';
import { Mono } from './Mono';

export interface StatTile {
  label: string;
  value: string;
  /** Colours only the figure. Left off, the figure is plain text. */
  tone?: StatusTone;
  onClick?: () => void;
}

/**
 * The hairline-separated tile strip at the top of the dashboard. One-pixel
 * gaps over a dark ground do the dividing, so there are no borders to align.
 */
export function StatTiles({ tiles }: { tiles: StatTile[] }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: `repeat(${tiles.length}, 1fr)`,
        gap: '1px',
        background: neutral[900],
        border: `1px solid ${neutral[900]}`,
        borderRadius: 2,
        overflow: 'hidden',
      }}
    >
      {tiles.map((t) => (
        <Box
          key={t.label}
          onClick={t.onClick}
          sx={{
            background: base.surface,
            p: '14px 14px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            cursor: t.onClick ? 'pointer' : 'default',
            transition: 'background 120ms',
            '&:hover': t.onClick ? { background: neutral[900] } : undefined,
          }}
        >
          <Typography variant="overline">{t.label}</Typography>
          <Mono sx={{ fontSize: 28, lineHeight: 1, color: t.tone ? status[t.tone].fg : 'text.primary' }}>
            {t.value}
          </Mono>
        </Box>
      ))}
    </Box>
  );
}
