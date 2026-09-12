import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { fadeIn } from '../theme/motion';

/**
 * What a screen looks like while its chunk is in flight.
 *
 * Routes are code-split, so navigating to a screen for the first time in a
 * session costs a network round trip. It is usually tens of milliseconds on a
 * warm connection and a second on a hub's phone tether, and either way the
 * shell — rail, mode toggle, content column — is already there. Only the
 * column swaps, so the page does not appear to reload.
 *
 * The fade is delayed a beat: a spinner that flashes for 40ms reads as a
 * glitch, and most navigations resolve inside that.
 */
export function RouteFallback() {
  return (
    <Box
      role="status"
      aria-label="Loading screen"
      sx={{
        display: 'grid',
        placeItems: 'center',
        minHeight: 360,
        ...fadeIn,
        animationDelay: '180ms',
      }}
    >
      <CircularProgress size={22} thickness={5} />
    </Box>
  );
}
