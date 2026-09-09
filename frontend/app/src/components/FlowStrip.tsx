import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { accent, neutral, status } from '../theme/tokens';

/**
 * The stages of a process that has not started yet.
 *
 * Both places this appears — a spreadsheet import and a camera scan — are
 * multi-stage and irreversible-feeling, and the prototype answers the same
 * question in both: how many more times will this ask me something before it
 * commits. It wraps rather than scrolls, so a six-stage chain survives a phone.
 */
export function FlowStrip({
  stages,
  activeIndex,
}: {
  stages: readonly string[];
  /** Index of the stage in progress; earlier ones read as done. */
  activeIndex?: number;
}) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2 }}>
      {stages.map((s, i) => {
        const done = activeIndex !== undefined && i < activeIndex;
        const active = activeIndex === i;
        return (
          <Box key={s} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box
              sx={{
                fontSize: 12,
                px: 2,
                py: '3px',
                borderRadius: '4px',
                whiteSpace: 'nowrap',
                color: active ? accent[100] : done ? status.good.fg : neutral[400],
                background: active ? accent[800] : done ? status.good.bg : neutral[900],
              }}
            >
              {s}
            </Box>
            {i < stages.length - 1 && (
              <Typography aria-hidden sx={{ fontSize: 12, color: 'grey.700' }}>
                →
              </Typography>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
