import AddIcon from '@mui/icons-material/AddOutlined';
import ArrowIcon from '@mui/icons-material/ArrowForwardOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import type { SvgIconComponent } from '@mui/icons-material';
import { Panel } from '../../../components/Panel';
import { accent } from '../../../theme/tokens';

export interface BoardStat {
  label: string;
  value: number;
  /** Opens the board already filtered to this status. */
  onClick?: () => void;
}

/**
 * One of the two workspaces on Job Card Management: its number, its name, the
 * one line that says which bikes belong to it, its three counts and its primary
 * button. The table lives in a pop-up the card opens, so the page itself is
 * only the choice between the two queues.
 *
 * The whole card opens the table for a mouse or a finger; the "View job cards"
 * button is the same action as a real control, for the keyboard and screen readers.
 */
export function CategoryCard({
  overline,
  title,
  description,
  icon: Icon,
  stats,
  total,
  actionLabel,
  onAction,
  onOpen,
}: {
  overline: string;
  title: string;
  description: string;
  icon: SvgIconComponent;
  stats: BoardStat[];
  /** Every card on this board, open or closed — what the pop-up will list. */
  total: number;
  /** Left off for a role that may not open job cards. */
  actionLabel?: string;
  onAction?: () => void;
  onOpen: () => void;
}) {
  return (
    <Box onClick={onOpen} sx={{
      cursor: 'pointer', borderRadius: 3, height: '100%',
      transition: 'transform 150ms, box-shadow 150ms',
      '& > .MuiPaper-root': { height: '100%', transition: 'border-color 150ms' },
      '&:hover': { transform: { md: 'translateY(-2px)' } },
      '&:hover > .MuiPaper-root': { borderColor: accent[700] },
    }}>
      <Panel
        label={overline}
        action={
          <Box
            aria-hidden
            sx={{
              width: 40, height: 40, borderRadius: 2, display: 'grid', placeItems: 'center',
              color: accent[200], background: accent[900], border: `1px solid ${accent[800]}`,
              '& svg': { fontSize: 20 },
            }}
          >
            <Icon />
          </Box>
        }
      >
        <Typography variant="h3" sx={{ fontSize: { xs: 19, sm: 21 } }}>{title}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{description}</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 2, mt: 3 }}>
          {stats.map((stat) => (
            // The figure and what it counts are one fact, so they are announced as one.
            <Box key={stat.label} role="group" aria-label={`${stat.label}: ${stat.value}`} sx={{ minWidth: 0 }}>
              <ButtonBase onClick={(e) => { e.stopPropagation(); (stat.onClick ?? onOpen)(); }} aria-label={`Show ${stat.label} job cards (${stat.value})`}
                sx={{
                  width: '100%', display: 'block', textAlign: 'left', border: 1, borderColor: 'divider', borderRadius: 2, px: 2, py: 1.5,
                  transition: 'border-color 120ms, background 120ms',
                  '&:hover, &.Mui-focusVisible': { borderColor: accent[700], background: accent[900] },
                }}>
                <Typography sx={{ fontSize: 24, fontWeight: 600, lineHeight: 1.2 }}>{stat.value}</Typography>
                <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>{stat.label}</Typography>
              </ButtonBase>
            </Box>
          ))}
        </Box>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 2, mt: 3 }}>
          {actionLabel
            // The card behind it opens the table; this button opens the form instead, so it keeps its click.
            ? <Button startIcon={<AddIcon />} onClick={(e) => { e.stopPropagation(); onAction?.(); }}>{actionLabel}</Button>
            : <span />}
          <Button color="inherit" endIcon={<ArrowIcon />} onClick={(e) => { e.stopPropagation(); onOpen(); }}
            aria-label={`View ${title} job cards (${total})`}>
            View job cards ({total})
          </Button>
        </Box>
      </Panel>
    </Box>
  );
}
