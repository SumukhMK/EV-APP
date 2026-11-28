import Box from '@mui/material/Box';
import { status } from '../../theme/tokens';

/**
 * Marks a required field: a red star after the label — the same mark MUI
 * draws for a field set `required`, which theme.ts colours to match.
 *
 * The star is aria-hidden, as MUI's own is, so the field's accessible name
 * stays its label ("Full name", not "Full name *").
 */
export function MandatoryLabel() {
  return (
    <Box component="span" aria-hidden="true" sx={{ ml: 0.5, color: status.bad.fg, fontWeight: 600, letterSpacing: 0 }}>
      *
    </Box>
  );
}
