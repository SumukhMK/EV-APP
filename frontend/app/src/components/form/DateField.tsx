import { useRef } from 'react';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import CalendarIcon from '@mui/icons-material/CalendarTodayOutlined';

/** Digits and dashes only, in `YYYY-MM-DD` shape. */
function dateMask(value: string): string {
  const raw = value.replace(/[^\d]/g, '').slice(0, 8);
  const y = raw.slice(0, 4);
  const m = raw.slice(4, 6);
  const d = raw.slice(6, 8);
  return [y, m, d].filter(Boolean).join('-');
}

/**
 * A date the operator can type.
 *
 * A native `<input type="date">` cannot be typed into freely — it is three
 * fixed segments and a picker, which is slow when somebody already knows the
 * date and is reading it off a form. So the visible control is a text box that
 * takes `YYYY-MM-DD` (inserting the dashes as you go), and the calendar button
 * still opens the real picker for the times when clicking is easier.
 *
 * The value stays `YYYY-MM-DD` throughout, which is what the schema and the
 * wire already expect, so nothing downstream has to know the difference.
 */
export function DateField({
  label,
  value,
  onChange,
  error,
  helperText,
  fullWidth = true,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  error?: boolean;
  helperText?: string;
  fullWidth?: boolean;
}) {
  const picker = useRef<HTMLInputElement>(null);

  return (
    <Box sx={{ position: 'relative', width: fullWidth ? '100%' : undefined }}>
      <TextField
        label={label}
        value={value}
        onChange={(e) => onChange(dateMask(e.target.value))}
        placeholder="YYYY-MM-DD"
        error={error}
        helperText={helperText}
        fullWidth={fullWidth}
        slotProps={{
          htmlInput: { inputMode: 'numeric', maxLength: 10 },
          input: {
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  size="small"
                  aria-label={`Pick ${label.toLowerCase()}`}
                  onClick={() => {
                    const el = picker.current;
                    if (!el) return;
                    // showPicker is the only way to open the native calendar
                    // from another control; falling back to focus keeps older
                    // browsers usable rather than dead.
                    if (typeof el.showPicker === 'function') el.showPicker();
                    else el.focus();
                  }}
                >
                  <CalendarIcon sx={{ fontSize: 16, color: 'text.primary' }} />
                </IconButton>
              </InputAdornment>
            ),
          },
        }}
      />
      {/* The real picker, kept out of the layout but still reachable. */}
      <Box
        component="input"
        ref={picker}
        type="date"
        value={value}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        tabIndex={-1}
        aria-hidden
        sx={{
          position: 'absolute',
          right: 12,
          bottom: 8,
          width: 1,
          height: 1,
          opacity: 0,
          border: 0,
          padding: 0,
          pointerEvents: 'none',
        }}
      />
    </Box>
  );
}
