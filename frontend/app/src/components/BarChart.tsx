import Box from '@mui/material/Box';
import { bandFor, chart, neutral, scale } from '../theme/tokens';
import { Mono } from './Mono';

export interface Bar {
  label: string;
  value: number;
}

/** Labels repeat across a 13-month window (two Augusts), so position is the key. */
const barKey = (b: Bar, i: number) => `${i}-${b.label}`;

/**
 * A plain CSS bar chart, on purpose.
 *
 * The dashboard shows one series of thirteen integers. A charting library
 * would add ~150KB, its own theming surface and its own tooltip conventions to
 * draw something the grid already draws correctly. The tallest bar takes the
 * lighter accent so the peak reads without a legend, and the last (partial)
 * month takes the darkest so nobody mistakes it for a completed month.
 */
export function BarChart({ bars, height = 196 }: { bars: Bar[]; height?: number }) {
  const max = Math.max(...bars.map((b) => b.value), 1);

  // Thirteen labelled columns cannot compress below their text. Rather than
  // let the month row spill out of the panel, the chart scrolls as one piece
  // and keeps the labels under their own bars.
  const minWidth = bars.length * 42;

  return (
    <Box sx={{ overflowX: 'auto', pb: 1 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: { xs: 1.5, sm: 3.5 },
          height,
          minWidth,
          mt: 5,
          borderBottom: `1px solid ${neutral[800]}`,
        }}
      >
        {bars.map((b, i) => {
          const isLast = i === bars.length - 1;
          // Each bar is coloured by where it sits against the best month, so
          // the chart ranks itself rather than painting one flat series. The
          // last bar is the month still running and is held out of that — a
          // partial figure is not a bad month.
          const share = max === 0 ? 0 : Math.round((b.value / max) * 100);
          return (
            <Box
              key={barKey(b, i)}
              sx={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 1.5,
              }}
            >
              <Mono sx={{ fontSize: 11, color: neutral[500] }}>{b.value}</Mono>
              <Box
                sx={{
                  width: '100%',
                  height: `${Math.round((b.value / max) * (height - 24))}px`,
                  background: isLast ? chart.current : scale[bandFor(share)].bar,
                }}
              />
            </Box>
          );
        })}
      </Box>
      <Box sx={{ display: 'flex', gap: { xs: 1.5, sm: 3.5 }, minWidth, mt: 1.75 }}>
        {bars.map((b, i) => (
          <Mono
            key={barKey(b, i)}
            sx={{ flex: 1, minWidth: 0, textAlign: 'center', fontSize: 10, color: neutral[600] }}
          >
            {b.label}
          </Mono>
        ))}
      </Box>
    </Box>
  );
}
