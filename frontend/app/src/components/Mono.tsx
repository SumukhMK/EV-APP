import { styled } from '@mui/material/styles';
import { fonts } from '../theme/tokens';

/**
 * Monospaced, tabular figures. Every id, chassis number, amount and timestamp
 * uses it, so columns of numbers stay aligned as values change.
 *
 * Deliberately a plain span: it is inline text, and keeping it non-polymorphic
 * avoids MUI's `component` typing entirely. Where a block is wanted, wrap it
 * or pass `sx={{ display: 'block' }}`.
 */
export const Mono = styled('span')({
  fontFamily: fonts.mono,
  fontVariantNumeric: 'tabular-nums',
});
