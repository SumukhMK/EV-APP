import Box from '@mui/material/Box';
import { accent, neutral } from '../theme/tokens';
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
  const peakIndex = bars.reduce((best, b, i) => (b.value > bars[best].value ? i : best), 0);

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
          const isPeak = i === peakIndex;
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
                  background: isLast ? accent[800] : isPeak ? accent[600] : accent[700],
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
