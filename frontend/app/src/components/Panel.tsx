import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import ExpandMoreOutlined from '@mui/icons-material/ExpandMoreOutlined';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { Children, Fragment, isValidElement, useId, useState, type ReactNode } from 'react';
import { panelAnchor, tourAnchor } from '../tour/anchors';

/**
 * A titled surface. The label is the same tracked-out `overline` as PageHeader.
 *
 * `locked` is for a panel whose fields only make sense once an earlier
 * choice is made — the return condition before a rider is picked, the
 * problem before a bike is picked. The panel stays visible so the operator
 * sees what is coming, but its contents cannot be focused, typed into or
 * clicked (`inert`), they are dimmed, and the reason sits under the title:
 * "Pick the rider first". Nothing is pre-filled behind a lock, so a form
 * cannot carry a value the operator never chose for that subject.
 */
/**
 * The lock on its own, for fields that share a panel with the choice they
 * depend on (the problem fields under the bike picker on the new-job
 * screen). Same rule as a locked Panel: inert, dimmed, with the reason.
 */
export function Locked({
  locked,
  children,
  sx,
}: {
  locked?: string | false | null;
  children: ReactNode;
  /** Layout for the locked body, so children laid out by a parent grid keep their spacing. */
  sx?: React.ComponentProps<typeof Box>['sx'];
}) {
  if (!locked) {
    return children;
  }
  return (
    <Box>
      <Typography role="note" sx={{ fontSize: 13, color: (theme) => (theme.palette.mode === 'dark' ? 'common.white' : 'warning.main'), mb: 3 }}>
        {locked}
      </Typography>
      <Box
        inert
        aria-disabled
        sx={[{ opacity: 0.45, filter: 'grayscale(0.4)', pointerEvents: 'none', userSelect: 'none' }, ...(Array.isArray(sx) ? sx : [sx])]}
      >
        {children}
      </Box>
    </Box>
  );
}

/**
 * The words in a label, for use as a key.
 *
 * A label is a `ReactNode`, and ten panels title themselves
 * `<>Money <InfoTip …/></>` so a tip can sit beside the words. Keying only off
 * plain strings dropped every one of those from its screen's tour — the assign,
 * exchange and deboard flows lost every card they had — even though the words
 * were sitting right there in the label.
 *
 * Only the label's own direct text counts. Anything nested is somebody else's
 * content, and an info tip's sentence has no business becoming a card's name.
 */
function labelText(label: ReactNode): string | null {
  if (typeof label === 'string') return label.trim() || null;
  // `<>Money <InfoTip/></>` arrives as one fragment element; its text is a
  // child of that fragment, not of the label, so it has to be opened first.
  const nodes =
    isValidElement(label) && label.type === Fragment
      ? (label.props as { children?: ReactNode }).children
      : label;
  const words = Children.toArray(nodes)
    .filter((child) => !isValidElement(child))
    .map((child) => (typeof child === 'string' || typeof child === 'number' ? String(child) : ''))
    .join('')
    .trim();
  return words || null;
}

export function Panel({
  label,
  subtitle,
  action,
  children,
  sx,
  locked,
  collapsible,
  defaultOpen = true,
}: {
  label?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  sx?: React.ComponentProps<typeof Paper>['sx'];
  /** When set, the body is inert and dimmed, and this sentence says why. */
  locked?: string | false | null;
  /**
   * When set, the title toggles the body open and closed. The title stays
   * visible either way, so a collapsed section still says what it holds.
   */
  collapsible?: boolean;
  /** Where a collapsible panel starts. Defaults to open, so existing screens read the same. */
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();

  /**
   * Every titled card is a tour target, declared once here rather than forty
   * times across the pages, and keyed by the label the card already shows — so
   * a card and the words written about it cannot drift apart without the step
   * simply failing to match.
   *
   * A collapsed panel is still a target: the card and its title are on screen
   * either way, and being pointed at a section worth opening is the useful
   * outcome.
   */
  const key = labelText(label);
  const anchor = key ? tourAnchor(panelAnchor(key)) : {};

  const header = (
    <Box>
      {label && <Typography variant="overline">{label}</Typography>}
      {subtitle && (
        <Typography sx={{ fontSize: 14, color: 'grey.400', mt: '3px' }}>{subtitle}</Typography>
      )}
      {locked && (
        <Typography role="note" sx={{ fontSize: 13, color: (theme) => (theme.palette.mode === 'dark' ? 'common.white' : 'warning.main'), mt: 1 }}>
          {locked}
        </Typography>
      )}
    </Box>
  );

  return (
    <Paper
      {...anchor}
      sx={[{ p: { xs: '16px 14px 14px', sm: '18px 20px 16px' } }, ...(Array.isArray(sx) ? sx : [sx])]}
    >
      {(label || action) && (
        <Box
          sx={{
            display: 'flex',
            // The action drops below the label on a narrow panel; side by side
            // it squeezes a two-word subtitle onto four lines.
            flexDirection: { xs: 'column', sm: 'row' },
            alignItems: { xs: 'flex-start', sm: 'flex-end' },
            justifyContent: 'space-between',
            gap: { xs: 2, sm: 4 },
            mb: !open ? 2 : subtitle ? 4 : 3,
          }}
        >
          {collapsible ? (
            <Box
              role="button"
              tabIndex={0}
              onClick={() => setOpen((o) => !o)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setOpen((o) => !o);
                }
              }}
              aria-expanded={open}
              aria-controls={bodyId}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                cursor: 'pointer',
                '&:hover .panel-chevron': { color: 'text.primary' },
              }}
            >
              {header}
              <ExpandMoreOutlined
                className="panel-chevron"
                sx={{
                  fontSize: 20,
                  color: 'grey.500',
                  transform: open ? 'rotate(180deg)' : 'none',
                  transition: 'transform 200ms ease',
                }}
              />
            </Box>
          ) : (
            header
          )}
          {action}
        </Box>
      )}
      {locked ? (
        <Collapse in={open} id={bodyId}>
          <Box inert aria-disabled sx={{ opacity: 0.45, filter: 'grayscale(0.4)', pointerEvents: 'none', userSelect: 'none' }}>
            {children}
          </Box>
        </Collapse>
      ) : collapsible ? (
        <Collapse in={open} id={bodyId}>
          {children}
        </Collapse>
      ) : (
        children
      )}
    </Paper>
  );
}
