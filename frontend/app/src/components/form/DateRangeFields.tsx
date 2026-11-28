import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CalendarIcon from '@mui/icons-material/CalendarTodayOutlined';
import { neutral, status as tones } from '../../theme/tokens';

const big = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
const weekday = new Intl.DateTimeFormat('en-IN', { weekday: 'long' });
const asDate = (iso: string) => new Date(`${iso}T12:00:00`);

/**
 * One end of a date range, drawn as a card: a small label, the date large,
 * the weekday under it. Clicking anywhere on the card opens the calendar —
 * the real `<input type="date">` sits over the whole card, transparent, so a
 * phone opens its own picker and a desktop gets `showPicker()`.
 */
function DateCard({
  label,
  value,
  min,
  max,
  error,
  onChange,
}: {
  label: string;
  value: string;
  min?: string;
  max?: string;
  error?: boolean;
  onChange: (next: string) => void;
}) {
  return (
    <Box
      sx={{
        position: 'relative',
        flex: '1 1 0',
        minWidth: 0,
        px: 3,
        py: 2.5,
        borderRadius: 1.5,
        border: `1px solid ${error ? tones.bad.fg : neutral[800]}`,
        cursor: 'pointer',
        transition: 'border-color 120ms',
        '&:hover': { borderColor: error ? tones.bad.fg : neutral[500] },
        '&:focus-within': { outline: `2px solid ${error ? tones.bad.fg : neutral[300]}`, outlineOffset: 1 },
      }}
    >
      <Typography sx={{ fontSize: 11.5, letterSpacing: '0.08em', color: neutral[500], display: 'flex', alignItems: 'center', gap: 1 }}>
        <CalendarIcon sx={{ fontSize: 13 }} /> {label.toUpperCase()}
      </Typography>
      <Typography sx={{ fontSize: 20, fontWeight: 600, mt: 0.5, whiteSpace: 'nowrap' }}>
        {value ? big.format(asDate(value)) : 'Pick a date'}
      </Typography>
      <Typography sx={{ fontSize: 12.5, color: neutral[400] }}>{value ? weekday.format(asDate(value)) : ' '}</Typography>
      <Box
        component="input"
        type="date"
        aria-label={label}
        aria-invalid={error || undefined}
        value={value}
        min={min}
        max={max}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        onClick={(e: React.MouseEvent<HTMLInputElement>) => {
          const el = e.currentTarget;
          // Desktop Chrome only opens the calendar from its small icon; open it from anywhere.
          if (typeof el.showPicker === 'function') {
            try {
              el.showPicker();
            } catch {
              /* already open, or not allowed here — the input still works */
            }
          }
        }}
        sx={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          opacity: 0,
          cursor: 'pointer',
          border: 0,
          p: 0,
          m: 0,
          // iOS gives date inputs an intrinsic width; keep it inside the card.
          minWidth: 0,
          WebkitAppearance: 'none',
        }}
      />
    </Box>
  );
}

/**
 * Start and end date side by side. Says what is wrong with the range rather
 * than quietly fixing it; the caller decides not to fetch while `error` is set.
 */
export function DateRangeFields({
  from,
  to,
  max,
  error,
  onChange,
}: {
  from: string;
  to: string;
  /** The last day that can be picked, usually today. */
  max?: string;
  error?: string | null;
  onChange: (next: { from: string; to: string }) => void;
}) {
  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'stretch' }}>
        <DateCard label="Start date" value={from} max={to || max} onChange={(f) => onChange({ from: f, to })} />
        <DateCard
          label="End date"
          value={to}
          min={from || undefined}
          max={max}
          error={Boolean(error)}
          onChange={(t) => onChange({ from, to: t })}
        />
      </Box>
      {error && (
        <Typography role="alert" sx={{ mt: 1.5, fontSize: 13, color: tones.bad.fg }}>
          {error}
        </Typography>
      )}
    </Box>
  );
}
