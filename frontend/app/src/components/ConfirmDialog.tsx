import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

/**
 * The "are you sure?" gate, opened by the action it protects.
 *
 * The confirm button is the solid commit action — `contained` is reserved in
 * the theme for exactly this. Destructive actions pass `tone="bad"` and get
 * the error red; everything else uses the standard fill.
 *
 * `dismissible` is the high-stakes switch: when false, Escape and the backdrop
 * do nothing and the operator must pick Cancel or Confirm.
 *
 * Extra consequence detail rides in the (i) tooltip, so the message stays one
 * line and the detail is there for whoever wants it.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  info,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'neutral',
  dismissible = true,
  pending = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  /** Extra detail shown in the (i) tooltip on hover. */
  info?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'bad' | 'neutral';
  dismissible?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={dismissible ? onCancel : undefined}
      maxWidth="xs"
      fullWidth
    >
      <DialogTitle sx={{ fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, pr: 2 }}>
        {title}
        {info && (
          <Tooltip title={info} placement="top">
            <IconButton size="small" aria-label="More about this action">
              <InfoOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary">{message}</Typography>
      </DialogContent>
      <DialogActions sx={{ px: 6, pb: 5 }}>
        <Button color="inherit" onClick={onCancel} disabled={pending}>
          {cancelLabel}
        </Button>
        <Button variant="contained" color={tone === 'bad' ? 'error' : 'primary'} onClick={onConfirm} disabled={pending}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}