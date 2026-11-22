import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import InputAdornment from '@mui/material/InputAdornment';
import Snackbar from '@mui/material/Snackbar';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { recordPayment, reversePayment } from '../../lib/api/payments';
import { invalidatePayments } from '../../lib/invalidate';
import { useShakeValidation, shakeStyles } from '../../hooks/useShakeValidation';
import { PAYMENT_METHOD_LABEL } from '../../lib/labels';

import { Mono } from '../../components/Mono';
import { neutral, status as tones } from '../../theme/tokens';
import type { LastPayment, Payment, PaymentMethod } from '../../types';
import { inputFromPaise, newClientKey, owesText, paiseFromInput, money } from './money';

const METHODS: PaymentMethod[] = ['UPI', 'CASH', 'BANK_TRANSFER'];
/** A second payment of the same amount this soon is more likely a double entry. */
const REPEAT_WINDOW_MS = 2 * 60_000;
const justNow = (iso: string) => Date.now() - new Date(iso).getTime() < REPEAT_WINDOW_MS;

export interface CollectTarget {
  riderId: string;
  riderName: string;
  vehicleId: string | null;
  owes: number;
  daysLate: number;
  usualMethod: PaymentMethod;
  lastPayment: LastPayment | null;
}

type Confirm = { kind: 'repeat' | 'large'; message: string } | null;

/**
 * Collect a payment in two taps: the amount starts at what the rider owes and
 * the method at how they usually pay, so the common case is Enter.
 *
 * Less than owed stays owed; more is kept as credit. One form sends one
 * payment however many times it is submitted (a key travels with it). After
 * saving, a bar says what the rider owes now and offers Undo — only admins
 * reach this form, and Undo is a reversal, so nothing is ever deleted.
 */
export function CollectDialog({ target, onClose }: { target: CollectTarget | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const { containerRef, shake } = useShakeValidation();

  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('UPI');
  const [reference, setReference] = useState('');
  const [clientKey, setClientKey] = useState('');
  const [tried, setTried] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [saved, setSaved] = useState<{ payment: Payment; riderName: string } | null>(null);
  const [undone, setUndone] = useState(false);

  // Refill for each rider during render, so no frame shows the last rider's figures.
  const [lastRider, setLastRider] = useState<string | null>(null);
  const activeRider = target?.riderId ?? null;
  if (activeRider !== lastRider) {
    setLastRider(activeRider);
    setAmount(target ? inputFromPaise(target.owes) : '');
    setMethod(target?.usualMethod ?? 'UPI');
    setReference('');
    setClientKey(newClientKey());
    setTried(false);
    setConfirm(null);
  }

  const paise = paiseFromInput(amount);
  const valid = Number.isFinite(paise) && paise > 0;
  const showError = tried && !valid;

  const collect = useMutation({
    mutationFn: () =>
      recordPayment({
        riderId: target!.riderId,
        amount: paise,
        method,
        reference: method === 'CASH' ? undefined : reference.trim() || undefined,
        clientKey,
      }),
    onSuccess: (payment) => {
      invalidatePayments(queryClient);
      setUndone(false);
      setSaved({ payment, riderName: target!.riderName });
      onClose();
    },
  });

  const undo = useMutation({
    mutationFn: (id: string) => reversePayment(id, 'Undone right after saving'),
    onSuccess: () => {
      invalidatePayments(queryClient);
      setUndone(true);
    },
  });

  const submit = (event?: React.FormEvent) => {
    event?.preventDefault();
    if (collect.isPending || !target) return;
    if (!valid) {
      setTried(true);
      requestAnimationFrame(shake);
      return;
    }
    if (!confirm) {
      const last = target.lastPayment;
      if (last && last.amount === paise && justNow(last.at)) {
        setConfirm({
          kind: 'repeat',
          message: `${money(paise)} was already saved for ${target.riderName} a moment ago. Save it again?`,
        });
        return;
      }
      if (target.owes > 0 && paise > target.owes * 2) {
        setConfirm({
          kind: 'large',
          message: `That is more than twice what ${target.riderName} owes. The extra ${money(paise - target.owes)} is kept as credit.`,
        });
        return;
      }
    }
    collect.mutate();
  };

  const after = saved?.payment.owedAfter;

  return (
    <>
      <Dialog open={Boolean(target)} onClose={onClose} maxWidth="xs" fullWidth fullScreen={fullScreen}>
        <Box component="form" onSubmit={submit} noValidate sx={{ display: 'contents' }}>
          <DialogTitle sx={{ pb: 1 }}>
            <Typography sx={{ fontSize: 12, letterSpacing: '0.08em', color: neutral[500] }}>COLLECT PAYMENT</Typography>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 3, mt: 1 }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: 18, fontWeight: 600 }}>{target?.riderName}</Typography>
                <Mono sx={{ fontSize: 12, color: neutral[500] }}>
                  {target?.riderId}
                  {target?.vehicleId ? ` · ${target.vehicleId}` : ''}
                </Mono>
              </Box>
              {target && (
                <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                  <Typography sx={{ fontSize: 12, color: neutral[500] }}>Owes now</Typography>
                  <Mono
                    sx={{
                      fontSize: 20,
                      color: target.owes > 0 ? (target.daysLate > 0 ? tones.bad.fg : undefined) : tones.good.fg,
                    }}
                  >
                    {owesText(target.owes, true)}
                  </Mono>
                  {target.daysLate > 0 && (
                    <Typography sx={{ fontSize: 12, color: tones.bad.fg }}>{target.daysLate} days late</Typography>
                  )}
                </Box>
              )}
            </Box>
          </DialogTitle>

          <DialogContent ref={containerRef} sx={{ ...shakeStyles, pt: '12px !important' }}>
            <TextField
              label="Amount received"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setConfirm(null);
              }}
              fullWidth
              autoFocus
              inputMode="decimal"
              slotProps={{
                input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> },
                htmlInput: { inputMode: 'decimal', 'aria-describedby': 'amount-help', style: { fontSize: 20 } },
              }}
              error={showError}
              helperText={
                <span id="amount-help">
                  {showError
                    ? 'Enter the amount received, above zero.'
                    : 'Less than they owe is fine — the rest stays owed. More is kept as credit.'}
                </span>
              }
            />

            <Typography component="div" sx={{ fontSize: 13, color: neutral[400], mt: 3, mb: 1.5 }} id="paid-by">
              Paid by
            </Typography>
            <ToggleButtonGroup
              value={method}
              exclusive
              onChange={(_, next) => next && setMethod(next)}
              fullWidth
              aria-labelledby="paid-by"
            >
              {METHODS.map((m) => (
                <ToggleButton key={m} value={m} sx={{ minHeight: 44, textTransform: 'none', fontSize: 14 }}>
                  {m === 'BANK_TRANSFER' ? 'Bank' : PAYMENT_METHOD_LABEL[m]}
                  {target?.usualMethod === m ? ' · usual' : ''}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>

            {method !== 'CASH' && (
              <TextField
                label={`${method === 'UPI' ? 'UPI' : 'Bank'} reference (optional)`}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                fullWidth
                sx={{ mt: 3 }}
                slotProps={{ htmlInput: { maxLength: 100 } }}
              />
            )}

            {confirm && (
              <Box
                role="alert"
                sx={{
                  mt: 3,
                  p: 3,
                  borderRadius: 1.5,
                  background: tones.warn.bg,
                  color: tones.warn.fg,
                  fontSize: 14,
                }}
              >
                {confirm.message}
              </Box>
            )}
            {collect.isError && (
              <Typography role="alert" sx={{ mt: 3, fontSize: 13, color: tones.bad.fg }}>
                {(collect.error as Error).message || 'The payment was not saved. Try again.'}
              </Typography>
            )}
          </DialogContent>

          <DialogActions sx={{ px: 6, pb: 5, gap: 2 }}>
            <Button color="inherit" onClick={onClose} sx={{ minHeight: 44 }}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" sx={{ minHeight: 44, flex: { xs: 1, sm: 'none' } }}>
              {collect.isPending
                ? 'Saving…'
                : confirm
                  ? confirm.kind === 'repeat'
                    ? 'Yes, save again'
                    : `Yes, save ${money(paise)}`
                  : `Save ${valid ? money(paise) : 'payment'}`}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      <Snackbar
        open={Boolean(saved)}
        autoHideDuration={undone ? 4000 : 12000}
        onClose={(_, reason) => reason !== 'clickaway' && setSaved(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        message={
          saved
            ? undone
              ? `Undone. ${saved.riderName}'s payment was reversed.`
              : `${money(saved.payment.amount)} from ${saved.riderName}.` +
                (after == null ? '' : ` Now ${after > 0 ? `owes ${money(after)}` : owesText(after, true).toLowerCase()}.`)
            : ''
        }
        action={
          saved && !undone ? (
            <Button
              color="inherit"
              size="small"
              disabled={undo.isPending}
              onClick={() => undo.mutate(saved.payment.id)}
            >
              Undo
            </Button>
          ) : undefined
        }
      />
    </>
  );
}
