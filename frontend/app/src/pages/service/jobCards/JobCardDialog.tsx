import CloseIcon from '@mui/icons-material/CloseOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { shakeStyles, useShakeValidation } from '../../../hooks/useShakeValidation';

/**
 * The shell both job-card forms share: title and close, a two-column grid of
 * fields on desktop, the rule that changes with the answers, and Cancel /
 * Create Job Card. An invalid form shakes rather than greying the button out,
 * so the operator can always press it and be told what is missing.
 */
export function JobCardDialog({
  open,
  title,
  subtitle,
  helper,
  error,
  pending,
  ready,
  onSubmit,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  subtitle: string;
  helper: ReactNode;
  error?: string;
  pending: boolean;
  ready: boolean;
  onSubmit: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const { containerRef, shake } = useShakeValidation();
  return (
    <Dialog open={open} onClose={pending ? undefined : onClose} fullWidth maxWidth="md">
      <Box component="form" noValidate onSubmit={(e) => { e.preventDefault(); if (!ready) { shake(); return; } if (!pending) onSubmit(); }}>
        <DialogTitle sx={{ pr: 7 }}>
          {title}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{subtitle}</Typography>
          <IconButton aria-label="Close" onClick={onClose} disabled={pending} sx={{ position: 'absolute', top: 12, right: 12 }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent ref={containerRef} sx={shakeStyles}>
          <Box
            component="fieldset"
            disabled={pending}
            sx={{
              border: 0, p: 0, m: 0, minWidth: 0, display: 'grid', gap: 3, pt: 1,
              gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' },
            }}
          >
            {children}
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>{helper}</Typography>
          {error && <Alert severity="error" sx={{ mt: 3 }}>{error}</Alert>}
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'space-between', px: 3, pb: 3 }}>
          <Button color="inherit" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button type="submit" disabled={pending}>{pending ? 'Saving...' : 'Create Job Card'}</Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

/** A field the form fills in for the operator and will not let them retype. */
export function ReadOnlyField({ label, value, placeholder }: { label: string; value: string; placeholder?: string }) {
  return (
    <TextField label={label} value={value} placeholder={placeholder} slotProps={{ input: { readOnly: true } }} />
  );
}

