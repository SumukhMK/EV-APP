import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import GlobalStyles from '@mui/material/GlobalStyles';
import Link from '@mui/material/Link';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link as RouterLink, useParams } from 'react-router-dom';
import AccountIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { StatTiles } from '../../components/StatTiles';
import { StateChip } from '../../components/StateChip';
import { EmptyState } from '../../components/EmptyState';
import { Mono } from '../../components/Mono';
import { SimpleTable, type Column } from '../../components/SimpleTable';
import { FacetChips } from '../../components/FacetChips';
import { getPayment, getRiderAccount, markReceiptIssued, reversePayment } from '../../lib/api/payments';
import { invalidatePayments } from '../../lib/invalidate';
import { useShakeValidation, shakeStyles } from '../../hooks/useShakeValidation';
import { DUNNING_LABEL, DUNNING_TONE, PAYMENT_METHOD_LABEL } from '../../lib/labels';
import { formatDate, formatDateTime, rupeesWithSymbol } from '../../lib/format';
import { neutral, status as tones } from '../../theme/tokens';
import { useSession } from '../../app/sessionContext';
import { canCollectPayments } from '../../lib/roles';
import type { AccountLine, AccountLineKind, RiderAccount as Account } from '../../types';
import { CollectButton, CollectDialog, type CollectTarget } from './CollectDialog';
import { canCollectFrom, owesText, dayRange, money } from './money';
import { MandatoryLabel } from '../../components/form/MandatoryLabel';

type Show = 'all' | 'payments' | 'rent' | 'charges';
const SHOWS: Record<Show, AccountLineKind[]> = {
  all: ['RENT', 'CHARGE', 'PAYMENT', 'REVERSAL'],
  payments: ['PAYMENT', 'REVERSAL'],
  rent: ['RENT'],
  charges: ['CHARGE'],
};

function what(l: AccountLine): { title: string; detail: string } {
  switch (l.kind) {
    case 'RENT':
      return {
        title: `Rent · ${dayRange(l.date, l.to)}`,
        detail: `${l.days} ${l.days === 1 ? 'day' : 'days'}${l.locked ? '' : ' · this week, still running'}`,
      };
    case 'CHARGE':
      return { title: l.note ?? 'Charge', detail: 'Added to what the rider owes' };
    case 'PAYMENT':
      return {
        title: `Payment · ${l.method ? PAYMENT_METHOD_LABEL[l.method] : ''}`,
        detail: [l.receiptNo, l.reference && `ref ${l.reference}`].filter(Boolean).join(' · ') || '—',
      };
    case 'REVERSAL':
      return { title: `Payment reversed · ${l.method ? PAYMENT_METHOD_LABEL[l.method] : ''}`, detail: l.reason ?? '' };
  }
}

const DOT: Record<AccountLineKind, string> = {
  RENT: '#8b7cf6',
  CHARGE: tones.caution.fg,
  PAYMENT: tones.good.fg,
  REVERSAL: tones.bad.fg,
};

/**
 * A rider's account as a statement: every rent week, charge, payment and
 * reversal on the day it happened, with what they owed after each. Replaces
 * the receipt page and the weekly payment history.
 */
export function RiderAccount() {
  const { riderId = '' } = useParams();
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const { user } = useSession();
  const isAdmin = canCollectPayments(user.roleKey);

  const [show, setShow] = useState<Show>('all');
  const [collect, setCollect] = useState<CollectTarget | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [reversing, setReversing] = useState<AccountLine | null>(null);

  const account = useQuery({ queryKey: ['payments', 'account', riderId], queryFn: () => getRiderAccount(riderId) });
  const a = account.data;
  const lines = useMemo(() => (a?.lines ?? []).filter((l) => SHOWS[show].includes(l.kind)), [a, show]);

  if (account.isLoading) return <EmptyState title="Loading the account…" />;
  if (account.isError || !a) {
    return (
      <>
        <PageHeader section="Money" title="Rider account" icon={AccountIcon} backTo="/payments/collections" backLabel="Collections" />
        <EmptyState title={`No rider with id ${riderId}`} description={(account.error as Error | null)?.message} />
      </>
    );
  }

  const openCollect = () =>
    canCollectFrom(a.owes) &&
    setCollect({
      riderId: a.riderId,
      riderName: a.riderName,
      vehicleId: a.vehicleId,
      owes: a.owes,
      daysLate: a.daysLate,
      usualMethod: a.usualMethod,
      lastPayment: null,
    });

  const lineActions = (l: AccountLine) =>
    l.paymentId ? (
      <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
        {l.reversed && <StateChip label="Reversed" tone="bad" />}
        <Link component="button" type="button" onClick={(e: React.MouseEvent) => { e.stopPropagation(); setReceiptId(l.paymentId); }} sx={{ fontSize: 13 }}>
          Receipt
        </Link>
        {l.canReverse ? (
          <Link component="button" type="button" onClick={(e: React.MouseEvent) => { e.stopPropagation(); setReversing(l); }} sx={{ fontSize: 13, color: tones.warn.fg }}>
            Reverse
          </Link>
        ) : l.kind === 'PAYMENT' && !l.reversed && l.reverseBlock ? (
          // Says who can, instead of a dead link: the rule is the server's (ReversalPolicy).
          <Tooltip title={l.reverseBlock}>
            <Typography component="span" tabIndex={0} sx={{ fontSize: 12.5, color: neutral[500], cursor: 'help' }}>
              Reverse: ask an admin
            </Typography>
          </Tooltip>
        ) : null}
      </Box>
    ) : null;

  const amountCell = (l: AccountLine) => (
    <Mono sx={{ fontSize: 14, color: l.amount < 0 ? tones.good.fg : undefined, textDecoration: l.reversed ? 'line-through' : undefined }}>
      {money(l.amount)}
    </Mono>
  );

  const columns: Column<AccountLine>[] = [
    { key: 'date', header: 'Date', width: 110, render: (l) => <Mono sx={{ fontSize: 12.5, color: neutral[400] }}>{formatDate(l.date)}</Mono> },
    {
      key: 'what',
      header: 'What',
      wrap: true,
      render: (l) => {
        const w = what(l);
        return (
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', minWidth: 0 }}>
            <Box aria-hidden sx={{ width: 8, height: 8, borderRadius: '50%', background: DOT[l.kind], flex: 'none' }} />
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: 14 }}>{w.title}</Typography>
              <Typography sx={{ fontSize: 12, color: neutral[500] }}>{w.detail}</Typography>
            </Box>
          </Box>
        );
      },
    },
    { key: 'by', header: 'By', width: 140, render: (l) => <Typography sx={{ fontSize: 13, color: neutral[400] }}>{l.by ?? (l.kind === 'RENT' ? 'Auto' : '—')}</Typography> },
    { key: 'amount', header: 'Amount', align: 'right', width: 130, render: amountCell },
    { key: 'balance', header: 'Balance', align: 'right', width: 130, render: (l) => <Mono sx={{ fontSize: 14 }}>{money(l.balance)}</Mono> },
    { key: 'act', header: '', align: 'right', width: 170, render: lineActions },
  ];

  return (
    <>
      <PageHeader
        section="Money"
        title={a.riderName}
        icon={AccountIcon}
        backTo="/payments/collections"
        backLabel="Collections"
        actions={isAdmin ? <CollectButton owes={a.owes} onClick={openCollect} sx={{ minHeight: 40 }} /> : undefined}
      />

      <Box sx={{ mt: 3, display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <Mono sx={{ fontSize: 13, color: neutral[400], lineHeight: 1.8 }}>
          <Link component={RouterLink} to={`/riders/${a.riderId}`} title="Open rider profile">{a.riderId}</Link>
          {' · '}
          {a.vehicleId ? (
            <Link component={RouterLink} to={`/vehicles/${a.vehicleId}`} title="Open bike record">{a.vehicleId}</Link>
          ) : (
            'no bike'
          )}
          {' · '}
          {rupeesWithSymbol(a.planAmount)} a week · {money(a.perDayAmount)} a day
        </Mono>
        <Box sx={{ textAlign: { xs: 'left', sm: 'right' } }}>
          <Typography sx={{ fontSize: 12, letterSpacing: '0.08em', color: neutral[500] }}>OWES</Typography>
          <Mono sx={{ fontSize: 30, color: a.owes <= 0 ? tones.good.fg : a.daysLate > 0 ? tones.bad.fg : undefined }}>
            {owesText(a.owes, true)}
          </Mono>
          {a.daysLate > 0 && a.lateSince && (
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', justifyContent: { xs: 'flex-start', sm: 'flex-end' }, flexWrap: 'wrap' }}>
              <Typography sx={{ fontSize: 13, color: tones.bad.fg }}>
                {a.daysLate} days late · unpaid since {formatDate(a.lateSince)}
              </Typography>
              {a.stage && <StateChip label={DUNNING_LABEL[a.stage]} tone={DUNNING_TONE[a.stage]} />}
            </Box>
          )}
        </Box>
      </Box>

      <Box sx={{ mt: 4 }}>
        <StatTiles
          tiles={[
            { label: a.rentFrom ? `Rent since ${formatDate(a.rentFrom)}` : 'Rent', value: rupeesWithSymbol(a.rent) },
            { label: 'Repairs and charges', value: rupeesWithSymbol(a.charges) },
            { label: 'Paid', value: rupeesWithSymbol(a.paid), tone: 'good' },
            { label: 'Owes', value: owesText(a.owes), tone: a.owes > 0 ? 'bad' : 'good' },
          ]}
        />
      </Box>

      <Panel
        label="Account history"
        subtitle="Newest first. Balance is what the rider owed right after each line."
        action={
          <FacetChips<Show>
            value={show}
            onChange={setShow}
            options={[
              { value: 'all', label: 'Everything', count: a.lines.length },
              { value: 'payments', label: 'Payments', count: a.lines.filter((l) => SHOWS.payments.includes(l.kind)).length },
              { value: 'rent', label: 'Rent', count: a.lines.filter((l) => l.kind === 'RENT').length },
              { value: 'charges', label: 'Charges', count: a.lines.filter((l) => l.kind === 'CHARGE').length },
            ]}
          />
        }
        sx={{ mt: 5, p: { xs: '14px 12px 12px', sm: '18px 20px 14px' } }}
      >
        {lines.length === 0 ? (
          <EmptyState title="Nothing here yet" description="Rent, charges and payments appear here as they happen." />
        ) : phone ? (
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            {lines.map((l, i) => {
              const w = what(l);
              return (
                <Box key={`${l.kind}-${l.at}-${i}`} sx={{ py: 2.5, borderBottom: `1px solid ${neutral[900]}`, '&:last-of-type': { border: 0 } }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', minWidth: 0 }}>
                      <Box aria-hidden sx={{ width: 8, height: 8, mt: 0.75, borderRadius: '50%', background: DOT[l.kind], flex: 'none' }} />
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontSize: 14 }}>{w.title}</Typography>
                        <Typography sx={{ fontSize: 12, color: neutral[500] }}>
                          {formatDate(l.date)}
                          {l.by ? ` · ${l.by}` : ''} · {w.detail}
                        </Typography>
                      </Box>
                    </Box>
                    <Box sx={{ textAlign: 'right', flex: 'none' }}>
                      {amountCell(l)}
                      <Mono sx={{ display: 'block', fontSize: 12, color: neutral[500] }}>bal {money(l.balance)}</Mono>
                    </Box>
                  </Box>
                  {l.paymentId && <Box sx={{ mt: 1 }}>{lineActions(l)}</Box>}
                </Box>
              );
            })}
          </Box>
        ) : (
          <SimpleTable rows={lines} getRowKey={(l, i) => `${l.kind}-${l.at}-${i}`} columns={columns} scrollable />
        )}
      </Panel>

      <CollectDialog target={collect} onClose={() => setCollect(null)} />
      <ReceiptDialog paymentId={receiptId} onClose={() => setReceiptId(null)} />
      <ReverseDialog line={reversing} account={a} onClose={() => setReversing(null)} />
    </>
  );
}

/** One payment, printable. */
function ReceiptDialog({ paymentId, onClose }: { paymentId: string | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const payment = useQuery({
    queryKey: ['payments', 'payment', paymentId],
    queryFn: () => getPayment(paymentId!),
    enabled: Boolean(paymentId),
  });
  const p = payment.data;
  const row = (label: string, value: string, strong = false) => (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 3, py: 0.75, fontWeight: strong ? 600 : 400 }}>
      <span>{label}</span>
      <Mono sx={{ fontSize: 14, fontWeight: 'inherit' }}>{value}</Mono>
    </Box>
  );
  return (
    <Dialog open={Boolean(paymentId)} onClose={onClose} maxWidth="xs" fullWidth className="receipt-dialog">
      <GlobalStyles styles={{ '@media print': { 'body > *:not(.receipt-dialog)': { display: 'none !important' }, '.receipt-actions': { display: 'none !important' } } }} />
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', gap: 3 }}>
        <span>{p?.reversesId ? 'Reversal' : 'Receipt'}</span>
        <Mono sx={{ fontSize: 13, color: neutral[500] }}>{p?.receiptNo ?? ''}</Mono>
      </DialogTitle>
      <DialogContent>
        {!p ? (
          <Typography sx={{ fontSize: 14 }}>{payment.isError ? 'Could not load this payment.' : 'Loading…'}</Typography>
        ) : (
          <Box sx={{ fontSize: 14 }}>
            <Typography sx={{ fontSize: 17, fontWeight: 600 }}>
              {p.riderName} · {p.riderId}
            </Typography>
            <Mono sx={{ fontSize: 13, color: neutral[500] }}>
              {p.vehicleId ? `${p.vehicleId} · ` : ''}
              {formatDateTime(p.at)}
            </Mono>
            <Box sx={{ borderTop: `1px dashed ${neutral[700]}`, mt: 2.5, pt: 2 }}>
              {p.owedBefore != null && row('Owed before', money(p.owedBefore))}
              {row(
                p.reversesId ? `Reversed · ${PAYMENT_METHOD_LABEL[p.method]}` : `Paid · ${PAYMENT_METHOD_LABEL[p.method]}`,
                money(Math.abs(p.amount)),
                true,
              )}
              {p.owedAfter != null && row(p.owedAfter < 0 ? 'Credit now' : 'Owes now', money(Math.abs(p.owedAfter)))}
            </Box>
            <Box sx={{ borderTop: `1px dashed ${neutral[700]}`, mt: 2, pt: 2, color: neutral[400], fontSize: 13 }}>
              {p.by ? `Taken by ${p.by}` : ''}
              {p.reference ? ` · Reference ${p.reference}` : ''}
              {p.reason ? ` · ${p.reason}` : ''}
              {p.reversed ? ' · This payment was later reversed' : ''}
            </Box>
          </Box>
        )}
      </DialogContent>
      <DialogActions className="receipt-actions" sx={{ px: 6, pb: 5 }}>
        <Button color="inherit" onClick={onClose}>Close</Button>
        <Button
          variant="contained"
          disabled={!p}
          onClick={() => {
            // Recorded first: once the rider holds a printed receipt, staff cannot reverse it alone.
            if (p && !p.reversesId) {
              markReceiptIssued(p.id).then(() => invalidatePayments(queryClient)).catch(() => {});
            }
            window.print();
          }}
        >
          Print
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Admins take a payment back out with a reason; nothing is edited or deleted. */
function ReverseDialog({ line, account, onClose }: { line: AccountLine | null; account: Account; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const { containerRef, shake } = useShakeValidation();
  const [lastLine, setLastLine] = useState<string | null>(null);
  if ((line?.paymentId ?? null) !== lastLine) {
    setLastLine(line?.paymentId ?? null);
    setReason('');
    setTried(false);
  }

  const reverse = useMutation({
    mutationFn: () => reversePayment(line!.paymentId!, reason.trim()),
    onSuccess: () => {
      invalidatePayments(queryClient);
      onClose();
    },
  });
  const detailed = Boolean(line?.needsDetailedReason);
  const reasonOk = reason.trim().length >= (detailed ? 20 : 1);
  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (reverse.isPending) return;
    if (!reasonOk) {
      setTried(true);
      requestAnimationFrame(shake);
      return;
    }
    reverse.mutate();
  };
  const amount = line ? -line.amount : 0;

  return (
    <Dialog open={Boolean(line)} onClose={onClose} maxWidth="xs" fullWidth>
      <Box component="form" onSubmit={submit} noValidate sx={{ display: 'contents' }}>
        <DialogTitle>Reverse {money(amount)} payment?</DialogTitle>
        <DialogContent ref={containerRef} sx={shakeStyles}>
          <Typography sx={{ fontSize: 14, color: neutral[400], mb: 3 }}>
            {account.riderName} will owe {money(account.owes + amount)} again. The payment stays on the
            record with a reversing line beside it, and the audit log shows both.
          </Typography>
          <TextField
            label={<>Why is it being reversed? <MandatoryLabel /></>}
            placeholder="e.g. Wrong rider, typed 10,000 for 1,000"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            fullWidth
            autoFocus
            error={tried && !reasonOk}
            helperText={
              detailed
                ? 'More than 7 days old: say what happened, in at least 20 characters.'
                : tried && !reasonOk ? 'Say why — it goes on the record.' : ' '
            }
            slotProps={{ htmlInput: { maxLength: 200 } }}
          />
          {reverse.isError && (
            <Typography role="alert" sx={{ fontSize: 13, color: tones.bad.fg }}>
              {(reverse.error as Error).message}
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 6, pb: 5 }}>
          <Button color="inherit" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" color="warning">
            {reverse.isPending ? 'Reversing…' : 'Reverse payment'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
