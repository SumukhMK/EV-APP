import { useState, type MouseEvent } from 'react';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import HelpIcon from '@mui/icons-material/HelpOutlineOutlined';
import { TOUR_ANCHORS, tourAnchor } from './anchors';
import { useTour } from './tourContext';
import { neutral } from '../theme/tokens';

/**
 * The permanent way back in.
 *
 * Every other part of the tour can be dismissed — Escape, Skip, Stop showing
 * tips — and this button is what makes offering those safe. Without it, a user
 * who pressed Escape on their first morning has lost the orientation for good,
 * and a tour you can lose is a tour nobody dares dismiss.
 *
 * It is also the step the platform tour ends on, which is why it carries an
 * anchor of its own: the last thing the tour says is where to find it again.
 */
export function HelpMenu() {
  const tour = useTour();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const open = (event: MouseEvent<HTMLElement>) => setAnchorEl(event.currentTarget);
  const close = () => setAnchorEl(null);

  /** Every item closes the menu first, or it sits open over the tour it just started. */
  const choose = (action: () => void) => () => {
    close();
    action();
  };

  return (
    <>
      <Tooltip title="Help and tours" placement="bottom">
        <IconButton
          {...tourAnchor(TOUR_ANCHORS.help)}
          onClick={open}
          aria-label="Help and tours"
          aria-haspopup="menu"
          sx={{ color: neutral[400] }}
        >
          <HelpIcon sx={{ fontSize: 19 }} />
        </IconButton>
      </Tooltip>

      <Menu
        anchorEl={anchorEl}
        open={anchorEl !== null}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ list: { dense: true } }}
      >
        <MenuItem onClick={choose(tour.replayPlatform)}>Take the tour</MenuItem>
        {tour.hasPageTour && <MenuItem onClick={choose(tour.replayPage)}>About this screen</MenuItem>}
        {tour.muted ? (
          <MenuItem onClick={choose(tour.unmute)}>Show tips again</MenuItem>
        ) : (
          <MenuItem onClick={choose(tour.mute)}>Stop showing tips</MenuItem>
        )}
      </Menu>
    </>
  );
}
