import { useState } from 'react';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ClickAwayListener from '@mui/material/ClickAwayListener';
import Paper from '@mui/material/Paper';
import Popper from '@mui/material/Popper';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';

/**
 * The (i) tag: extra information that is not always needed sits behind a tap
 * or a hover instead of taking a line of the form.
 *
 * Hover shows a tooltip on devices that have a pointer. A tap or click opens
 * a small popover, so the same information is reachable on touch screens,
 * where hover does not exist. The popover is a footnote, not a dialog: it
 * does not lock the page scroll, trap focus, or hide the form behind it, and
 * it closes on a tap outside or Escape.
 */
export function InfoTip({
  title,
  placement = 'top',
}: {
  title: ReactNode;
  placement?: 'top' | 'bottom' | 'left' | 'right';
}) {
  const [anchorEl, setAnchorEl] = useState<SVGSVGElement | null>(null);
  const [hovered, setHovered] = useState(false);
  const open = Boolean(anchorEl);

  const toggle = (event: MouseEvent<SVGSVGElement>) => {
    // The (i) often sits inside a field label; stop the tap from also
    // focusing the field, which would pop the keyboard open on mobile.
    event.stopPropagation();
    // A click while hovering would otherwise leave the tooltip open next to
    // the popover; the popover is the click's answer, so drop the hover state.
    setHovered(false);
    setAnchorEl(open ? null : event.currentTarget);
  };

  return (
    <ClickAwayListener onClickAway={() => setAnchorEl(null)}>
      <span>
        <Tooltip
          title={title}
          placement={placement}
          open={hovered && !open}
          onOpen={() => setHovered(true)}
          onClose={() => setHovered(false)}
          disableTouchListener
          disableFocusListener
        >
          <InfoOutlinedIcon
            tabIndex={0}
            titleAccess="More information"
            onClick={toggle}
            onKeyDown={(e: KeyboardEvent<SVGSVGElement>) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                setHovered(false);
                setAnchorEl(open ? null : e.currentTarget);
              } else if (e.key === 'Escape') {
                setAnchorEl(null);
              }
            }}
            sx={{
              fontSize: 15,
              color: 'text.secondary',
              verticalAlign: 'middle',
              cursor: 'help',
              ml: 0.5,
              '&:hover': { color: 'text.primary' },
            }}
          />
        </Tooltip>
        <Popper open={open} anchorEl={anchorEl} placement={placement}>
          <Paper sx={{ p: 2, maxWidth: 'min(320px, calc(100vw - 32px))' }}>
            <Typography sx={{ fontSize: 13, lineHeight: 1.5 }}>{title}</Typography>
          </Paper>
        </Popper>
      </span>
    </ClickAwayListener>
  );
}