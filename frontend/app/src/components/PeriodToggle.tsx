import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import type { PeriodGrain } from '../lib/period';

/**
 * Day / week / month, plus the date the range hangs off.
 *
 * The range maths lives in `src/lib/period.ts` (`resolvePeriod`) so this file
 * stays a component-only module and a consuming screen can compute the range
 * without the control in hand — the payment run needs the same Wed→Tue weeks.
 */
export function PeriodToggle({
  grain,
  anchorIso,
  onChange,
}: {
  grain: PeriodGrain;
  anchorIso: string;
  onChange: (next: { grain: PeriodGrain; anchorIso: string }) => void;
}) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'center' }}>
      <ToggleButtonGroup
        exclusive
        size="small"
        value={grain}
        onChange={(_, next: PeriodGrain | null) => next && onChange({ grain: next, anchorIso })}
      >
        <ToggleButton value="DAY">Day</ToggleButton>
        <ToggleButton value="WEEK">Week</ToggleButton>
        <ToggleButton value="MONTH">Month</ToggleButton>
      </ToggleButtonGroup>
      <TextField
        type="date"
        value={anchorIso}
        onChange={(e) => onChange({ grain, anchorIso: e.target.value })}
        sx={{ width: 170 }}
      />
    </Box>
  );
}
