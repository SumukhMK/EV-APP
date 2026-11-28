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
import Tooltip from '@mui/material/Tooltip';
import { ApiError } from '../../lib/api/client';
import { recordPayment, reversePayment } from '../../lib/api/payments';
import { invalidatePayments } from '../../lib/invalidate';
import { useShakeValidation, shakeStyles } from '../../hooks/useShakeValidation';
import { PAYMENT_METHOD_LABEL } from '../../lib/labels';

import { Mono } from '../../components/Mono';
import { neutral, status as tones } from '../../theme/tokens';
import type { LastPayment, Payment, PaymentMethod } from '../../types';
import { canCollectFrom, inputFromPaise, newClientKey, owesText, paiseFromInput, money } from './money';
import { MandatoryLabel } from '../../components/form/MandatoryLabel';
import { rupeesInput } from '../../lib/inputFormat';

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

type Confirm = { kind: 'repeat'; message: string } | null;

/**
 * The Collect button every money screen uses. A rider who owes nothing gets a
 * disabled button that says so, so nobody can open the form to pay ahead.
 */
export function CollectButton({
  owes,
  onClick,
  compact = false,
  sx,
}: {
  owes: number;
  onClick: () => void;
  /** Rows: "No dues" fits where "No outstanding dues" does not. */
  compact?: boolean;
  sx?: React.ComponentProps<typeof Button>['sx'];
}) {
  if (!canCollectFrom(owes)) {
    return (
      <Tooltip title="No outstanding dues — nothing can be collected">
        {/* A disabled button fires no events, so the tooltip needs a wrapper. */}
        <Box component="span" sx={{ display: 'inline-flex', ...(sx as object) }}>
          <Button
            variant="outlined"
            size="small"
            disabled
            aria-label="Collect — no outstanding dues"
            sx={{ minHeight: 36, minWidth: 88, flex: 1, borderStyle: 'dashed', textTransform: 'none' }}
          >
            {compact ? 'No dues' : 'No outstanding dues'}
          </Button>
        </Box>
      </Tooltip>
    );
  }
  return (
    <Button
      variant="contained"
      size="small"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      sx={{ minHeight: 36, minWidth: 88, ...(sx as object) }}
    >
      Collect
    </Button>
  );
}

/** What went wrong, in the words the desk needs; the server's code decides. */
function errorText(error: unknown): string {
  if (error instanceof ApiError) {
    const code = error.details?.code;
    const owes = typeof error.details?.owes === 'number' ? (error.details.owes as number) : null;
    if (code === 'NO_OUTSTANDING_DUES') return 'This rider has no outstanding dues now — someone may have just collected. Nothing was saved.';
    if (code === 'PAYMENT_EXCEEDS_DUES' && owes != null) return `That is more than the ${money(owes)} owed now. Nothing was saved.`;
    if (code === 'INVALID_PAYMENT_AMOUNT') return 'Enter an amount above zero.';
  }
  return (error as Error)?.message || 'The payment was not saved. Try again.';
}

/**
 * Collect a payment in two taps: the amount starts at what the rider owes and
 * the method at how they usually pay, so the common case is Enter.
 *
 * Never more than is owed: less stays owed, more is refused here and again by
 * the server, which is the real rule. One form sends one payment however many
 * times it is submitted (a key travels with it). After saving, a bar says
 * what the rider owes now and offers Reverse — only admins reach this form, and
 * a reversal adds a line, so nothing is ever deleted.
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
  const max = target?.owes ?? 0;
  const tooMuch = Number.isFinite(paise) && paise > max;
  const valid = Number.isFinite(paise) && paise > 0 && !tooMuch;
  const showError = (tried && !valid) || tooMuch;

  const collect = useMutation({
    mutationFn: () =>
      recordPayment({
        riderId: target!.riderId,
        amount: paise,
        method,
        reference: method === 'CASH' ? undefined : reference.trim() || undefined,
        clientKey,
      }),
    onError: () => {
      // The figure on screen may be stale (someone else collected); fetch the real one.
      invalidatePayments(queryClient);
    },
    onSuccess: (payment) => {
      invalidatePayments(queryClient);
      setUndone(false);
      setSaved({ payment, riderName: target!.riderName });
      onClose();
    },
  });

  const undo = useMutation({
    mutationFn: (id: string) => reversePayment(id, 'Reversed right after collecting'),
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
          message: `${money(paise)} was already collected from ${target.riderName} a moment ago. Collect it again?`,
        });
        return;
      }
    }
    collect.mutate();
  };

  const after = saved?.payment.owedAfter;

  return (
    <>
      <Dialog open={Boolean(target) && canCollectFrom(max)} onClose={onClose} maxWidth="xs" fullWidth fullScreen={fullScreen}>
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
              label={<>Amount received <MandatoryLabel /></>}
              value={amount}
              onChange={(e) => {
                setAmount(rupeesInput(e.target.value, { decimals: 0 }));
                setConfirm(null);
              }}
              fullWidth
              autoFocus
              inputMode="numeric"
              slotProps={{
                input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> },
                htmlInput: { inputMode: 'numeric', 'aria-describedby': 'amount-help', style: { fontSize: 20 } },
              }}
              error={showError}
              helperText={
                <span id="amount-help">
                  {tooMuch
                    ? `No more than ${money(max)} — what ${target?.riderName ?? 'the rider'} owes. Advance payments are not taken.`
                    : showError
                      ? 'Enter the amount received, above zero.'
                      : `Up to ${money(max)}. Less is fine — the rest stays owed.`}
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
                {errorText(collect.error)}
              </Typography>
            )}
          </DialogContent>

          <DialogActions sx={{ px: 6, pb: 5, gap: 2 }}>
            <Button color="inherit" onClick={onClose} sx={{ minHeight: 44 }}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" sx={{ minHeight: 44, flex: { xs: 1, sm: 'none' } }}>
              {collect.isPending
                ? 'Collecting…'
                : confirm
                    ? 'Yes, collect again'
                  : `Collect ${valid ? money(paise) : ''}`.trim()}
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
              ? `Reversed. ${money(saved.payment.amount)} from ${saved.riderName} no longer counts.`
              : `${money(saved.payment.amount)} from ${saved.riderName}.` +
                (after == null ? '' : after > 0 ? ` Now owes ${money(after)}.` : ' PAID — no dues left.')
            : ''
        }
        action={
          saved && !undone ? (
            <Button
              size="small"
              variant="outlined"
              disabled={undo.isPending}
              onClick={() => undo.mutate(saved.payment.id)}
              // The theme's outlined button is dark text on a dark snackbar; take the snackbar's own colour.
              sx={{ color: 'inherit', borderColor: 'currentColor', '&.Mui-disabled': { color: 'inherit', opacity: 0.5 } }}
            >
              {undo.isPending ? 'Reversing…' : 'Reverse'}
            </Button>
          ) : undefined
        }
      />
    </>
  );
}
