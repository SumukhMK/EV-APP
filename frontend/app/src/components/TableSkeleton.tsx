import Box from '@mui/material/Box';
import { neutral } from '../theme/tokens';

const REDUCE = '@media (prefers-reduced-motion: reduce)';

/**
 * The shape of a table that is still being worked out.
 *
 * A bulk upload is the one place in this product where the wait is long
 * enough to need explaining: the file crosses the network, every row is
 * parsed, checked for required fields and lengths, and looked up twice
 * against the registry. A spinner says "something is happening"; this says
 * what is coming — a table, roughly this many rows wide — so the screen does
 * not jump when the real one replaces it.
 *
 * The breathing is deliberately slow (1.6s) and shallow. A dense screen full
 * of fast pulses reads as broken rather than busy, and it bows out entirely
 * under `prefers-reduced-motion`, where the bars simply sit at a flat tone.
 */
export function TableSkeleton({
  rows = 6,
  columns = [2, 2, 3, 1.4, 1],
  label = 'Loading',
}: {
  rows?: number;
  /** Relative widths, so the bars line up like the columns they stand in for. */
  columns?: number[];
  label?: string;
}) {
  return (
    <Box
      role="status"
      aria-live="polite"
      aria-label={label}
      sx={{
        '@keyframes owBreathe': {
          '0%, 100%': { opacity: 0.35 },
          '50%': { opacity: 0.75 },
        },
      }}
    >
      <Box sx={{ display: 'flex', gap: 2, pb: 1.5, borderBottom: `1px solid ${neutral[800]}` }}>
        {columns.map((weight, i) => (
          <Bar key={i} weight={weight} height={9} delayMs={i * 60} />
        ))}
      </Box>

      {Array.from({ length: rows }).map((_, r) => (
        <Box
          key={r}
          sx={{
            display: 'flex',
            gap: 2,
            alignItems: 'center',
            py: 2.5,
            borderBottom: `1px solid ${neutral[900]}`,
          }}
        >
          {columns.map((weight, c) => (
            // Staggered down and across, so the table reads as filling in
            // rather than flashing as one block.
            <Bar key={c} weight={weight} height={12} delayMs={r * 90 + c * 60} />
          ))}
        </Box>
      ))}
    </Box>
  );
}

function Bar({ weight, height, delayMs }: { weight: number; height: number; delayMs: number }) {
  return (
    <Box
      sx={{
        flex: weight,
        height,
        borderRadius: 0.5,
        background: neutral[800],
        animation: 'owBreathe 1600ms ease-in-out infinite',
        animationDelay: `${delayMs}ms`,
        [REDUCE]: { animation: 'none', opacity: 0.45 },
      }}
    />
  );
}
