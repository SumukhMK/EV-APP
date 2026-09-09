import { useState } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { recordPayment } from '../../lib/api/payments';
import { invalidatePayments } from '../../lib/invalidate';
import { PAYMENT_METHOD_LABEL } from '../../lib/labels';
import { rupees } from '../../lib/format';
import { neutral } from '../../theme/tokens';
import type { PaymentMethod } from '../../types';

export interface CollectTarget {
  riderId: string;
  riderName: string;
  totalDue: number;
  amountPaid: number;
}

const METHODS: PaymentMethod[] = ['UPI', 'CASH', 'BANK_TRANSFER'];

/**
 * Record a collection against a rider's current period. Shared by the run and
 * the receipt so both take money the same way. It defaults the amount to the
 * outstanding balance — the common case is "they paid what they owed" — but
 * lets it be edited down for a part payment.
 */
export function RecordPaymentDialog({
  target,
  onClose,
  onRecorded,
}: {
  target: CollectTarget | null;
  onClose: () => void;
  onRecorded?: (riderId: string) => void;
}) {
  const queryClient = useQueryClient();
  const balance = target ? Math.max(0, target.totalDue - target.amountPaid) : 0;

  const [amountRupees, setAmountRupees] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('UPI');

  // Refill the default each time a different rider's dialog opens. Done during
  // render rather than in an effect, so the field never paints one frame of the
  // previous rider's amount first.
  const [lastRider, setLastRider] = useState<string | null>(null);
  const activeRider = target?.riderId ?? null;
  if (activeRider !== lastRider) {
    setLastRider(activeRider);
    setAmountRupees(target ? String(Math.round(balance / 100)) : '');
    setMethod('UPI');
  }

  const collect = useMutation({
    mutationFn: (paise: number) =>
      recordPayment({ riderId: target!.riderId, amount: paise, method }),
    onSuccess: () => {
      invalidatePayments(queryClient);
      onRecorded?.(target!.riderId);
      onClose();
    },
  });

  const paise = Math.round(Number(amountRupees) * 100);
  const valid = paise > 0 && paise <= balance;

  return (
    <Dialog open={Boolean(target)} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontSize: 16 }}>
        Record payment · {target?.riderName}
      </DialogTitle>
      <DialogContent>
        <Typography sx={{ fontSize: 13, color: 'text.secondary', mb: 4 }}>
          Outstanding balance {rupees(balance)}. Enter what was collected — a smaller amount is
          recorded as a part payment.
        </Typography>

        <TextField
          label="Amount collected"
          type="number"
          value={amountRupees}
          onChange={(e) => setAmountRupees(e.target.value)}
          fullWidth
          autoFocus
          slotProps={{ input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> } }}
          error={amountRupees !== '' && !valid}
          helperText={
            amountRupees !== '' && !valid
              ? paise > balance
                ? 'More than the balance — record a smaller amount.'
                : 'Enter an amount above zero.'
              : ' '
          }
        />

        <Typography variant="overline" sx={{ display: 'block', mt: 2, mb: 1.5, color: neutral[500] }}>
          Method
        </Typography>
        <ToggleButtonGroup
          value={method}
          exclusive
          onChange={(_, next) => next && setMethod(next)}
          fullWidth
          size="small"
        >
          {METHODS.map((m) => (
            <ToggleButton key={m} value={m}>
              {PAYMENT_METHOD_LABEL[m]}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </DialogContent>
      <DialogActions sx={{ px: 6, pb: 5 }}>
        <Button color="inherit" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => valid && collect.mutate(paise)} disabled={!valid || collect.isPending}>
          Record {valid ? rupees(paise) : ''}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
