import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { SvgIconComponent } from '@mui/icons-material';
import { Link } from 'react-router-dom';
import { base, neutral, status, type StatusTone } from '../theme/tokens';
import { hoverLift, riseIn } from '../theme/motion';
import { Mono } from './Mono';
import { TOUR_ANCHORS, tourAnchor } from '../tour/anchors';

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
  const count = tiles.length;
  if (count === 0) return null;

  return (
    <Box
      {...tourAnchor(TOUR_ANCHORS.statTiles)}
      sx={{
        display: 'grid',
        // On wide screens, the eight-tile admin roles use two rows of four,
        // while roles with six tiles get one row of six. Smaller screens keep
        // fewer columns so labels and figures remain readable.
        gridTemplateColumns: {
          xs: `repeat(${Math.min(count, 2)}, minmax(0, 1fr))`,
          sm: `repeat(${Math.min(count, 3)}, minmax(0, 1fr))`,
          lg: count === 8 ? 'repeat(4, minmax(0, 1fr))' : `repeat(${count}, minmax(0, 1fr))`,
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
              gridColumn: {
                xs: count % 2 === 1 && i === count - 1 ? 'span 2' : 'auto',
                sm: count % 3 === 1 && i === count - 1 ? 'span 3' : 'auto',
                lg: 'auto',
              },
              position: 'relative',
              background: base.surface,
              // The corner glyph is 16px at `right: 12`, so the content box
              // stops 40px short of the right edge — a label that runs long
              // wraps instead of sliding under the icon on a narrow tile.
              p: { xs: '12px 40px 10px 12px', lg: '14px 40px 12px 14px' },
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
