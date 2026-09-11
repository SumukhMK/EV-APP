import Box from '@mui/material/Box';
import { Mono } from './Mono';
import { bandFor, neutral, scale, type ScaleBand } from '../theme/tokens';

const BAND_LABEL: Record<ScaleBand, string> = {
  high: 'High',
  mid: 'Mid',
  low: 'Low',
  risk: 'Risk',
};

/**
 * A figure, a bar and the band it falls in.
 *
 * The band is never passed in — it is derived from the value through
 * `bandFor`, so the bar, the number and the pill cannot contradict each other,
 * and a threshold moves in exactly one place.
 *
 * The label is spelled out rather than left to colour alone: the bands are
 * distinguishable by luminance as well as hue, but a word costs nothing and
 * removes the question entirely.
 */
export function ScaleMeter({
  label,
  percent,
  caption,
  showBand = true,
}: {
  label: string;
  percent: number;
  caption?: string;
  showBand?: boolean;
}) {
  const band = bandFor(percent);
  const tone = scale[band];

  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
        <Box sx={{ fontSize: 13, flex: 1, minWidth: 0 }}>{label}</Box>
        <Mono sx={{ fontSize: 13, color: tone.fg }}>{percent}%</Mono>
        {showBand && (
          <Box
            component="span"
            sx={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.04em',
              px: 2,
              py: '2px',
              borderRadius: 100,
              color: tone.fg,
              background: tone.bg,
            }}
          >
            {BAND_LABEL[band]}
          </Box>
        )}
      </Box>

      <Box
        sx={{ height: 7, borderRadius: 100, background: neutral[900], overflow: 'hidden' }}
        role="meter"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label}: ${percent} percent, ${BAND_LABEL[band]}`}
      >
        <Box
          sx={{
            height: '100%',
            width: `${Math.max(0, Math.min(100, percent))}%`,
            background: tone.bar,
            borderRadius: 100,
            transition: 'width .3s ease',
          }}
        />
      </Box>

      {caption && <Box sx={{ fontSize: 11, color: neutral[500] }}>{caption}</Box>}
    </Box>
  );
}
