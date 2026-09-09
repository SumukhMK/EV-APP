import TextField from '@mui/material/TextField';

/**
 * A field the operator reads rather than fills.
 *
 * The prototype labels one of these "Security Deposit Pending (Auto
 * Calculated)" — the parenthesis is doing real work, because a box that looks
 * like an input invites someone to correct the arithmetic. It is a read-only
 * TextField, not plain text, so it keeps its place in the form grid; and it
 * shows its own derivation, so a figure that looks wrong can be argued with.
 */
export function DerivedField({
  label,
  value,
  derivation,
}: {
  label: string;
  value: string;
  derivation?: string;
}) {
  return (
    <TextField
      label={label}
      value={value}
      helperText={derivation}
      slotProps={{ input: { readOnly: true } }}
      sx={{ '& .MuiInputBase-input': { fontFamily: 'monospace' } }}
    />
  );
}
