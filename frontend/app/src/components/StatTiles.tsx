import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { SvgIconComponent } from '@mui/icons-material';
import { Link } from 'react-router-dom';
import { base, neutral, status, type StatusTone } from '../theme/tokens';
import { hoverLift, riseIn } from '../theme/motion';
import { Mono } from './Mono';

export interface StatTile {
  label: string;
  value: string;
  /** Colours only the figure. Left off, the figure is plain text. */
  tone?: StatusTone;
  /** A quiet glyph in the corner, so a strip of numbers reads at a glance. */
  icon?: SvgIconComponent;
  /**
   * Where the figure came from. A tile counts a set, so it should lead to that
   * set. Given a `to`, the tile is a real anchor — middle-click opens it in a
   * tab, the keyboard reaches it, and the browser shows the target on hover.
   */
  to?: string;
}

/**
 * The hairline-separated tile strip at the top of the dashboard. One-pixel
 * gaps over a dark ground do the dividing, so there are no borders to align.
 * Tiles rise in on load with a light stagger, and the ones that lead somewhere
 * lift a touch on hover.
 */
export function StatTiles({ tiles }: { tiles: StatTile[] }) {
  return (
    <Box
      sx={{
        display: 'grid',
        // The strip reflows rather than scrolls: seven tiles across on a wide
        // screen, four on a laptop, two on a phone. The 1px gaps still do the
        // dividing, so a wrapped row needs no extra rules.
        gridTemplateColumns: {
          xs: 'repeat(2, 1fr)',
          sm: `repeat(${Math.min(tiles.length, 4)}, 1fr)`,
          lg: `repeat(${tiles.length}, 1fr)`,
        },
        gap: '1px',
        background: neutral[900],
        border: `1px solid ${neutral[900]}`,
        borderRadius: 2,
        overflow: 'hidden',
      }}
    >
      {tiles.map((t, i) => {
        const Icon = t.icon;
        return (
          <Box
            key={t.label}
            {...(t.to ? { component: Link, to: t.to } : {})}
            sx={{
              // An odd count leaves a dead cell in the two-column layout, which
              // reads as a broken tile. The last one takes the whole row instead.
              gridColumn: {
                xs: tiles.length % 2 === 1 && t === tiles[tiles.length - 1] ? 'span 2' : 'auto',
                sm: 'auto',
              },
              position: 'relative',
              background: base.surface,
              p: { xs: '12px 12px 10px', lg: '14px 14px 12px' },
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              color: 'inherit',
              textDecoration: 'none',
              cursor: t.to ? 'pointer' : 'default',
              ...riseIn(i * 45),
              ...(t.to ? hoverLift : {}),
              '&:hover': t.to ? { background: neutral[900] } : undefined,
            }}
          >
            {Icon && (
              <Icon
                sx={{
                  position: 'absolute',
                  top: 12,
                  right: 12,
                  fontSize: 16,
                  color: t.tone ? status[t.tone].fg : neutral[600],
                  opacity: 0.6,
                }}
              />
            )}
            <Typography variant="overline">{t.label}</Typography>
            <Mono
              sx={{
                fontSize: { xs: 24, lg: 28, xl: 32 },
                lineHeight: 1,
                color: t.tone ? status[t.tone].fg : 'text.primary',
              }}
            >
              {t.value}
            </Mono>
          </Box>
        );
      })}
    </Box>
  );
}
