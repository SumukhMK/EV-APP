import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Snackbar from '@mui/material/Snackbar';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { StatTiles } from '../../components/StatTiles';
import { StateChip } from '../../components/StateChip';
import { EmptyState } from '../../components/EmptyState';
import { Mono } from '../../components/Mono';
import { SimpleTable } from '../../components/SimpleTable';
import { RecordPaymentDialog, type CollectTarget } from './RecordPaymentDialog';
import { getCurrentPaymentRun } from '../../lib/api/payments';
import { PAYMENT_STATUS_LABEL, PAYMENT_STATUS_TONE } from '../../lib/labels';
import { formatDate, rupees } from '../../lib/format';
import { accent, neutral } from '../../theme/tokens';
import type { PaymentPeriodRow } from '../../types';

/**
 * The weekly billing run (artboard 15): every rider due in the current period,
 * what each owes, and what has come in. It is the screen the numbers are
 * argued about on, so it shows the whole calculation — days billed, service,
 * arrears — not just the total. Each row opens that rider's receipt.
 *
 * Only the Monday cycle is built; the Wednesday run is the same screen against
 * the other billing day, and waits on its own fixture rather than being faked.
 */
export function PaymentRun() {
  const navigate = useNavigate();
  const theme = useTheme();
  // The figures that must survive to a phone are who owes and whether they
  // paid. The workings — days, per-day, service, arrears — are what get shed
  // first, then the plan amount; the receipt carries all of them anyway.
  const compact = useMediaQuery(theme.breakpoints.down('lg'));
  const stacked = useMediaQuery(theme.breakpoints.down('sm'));

  const [collect, setCollect] = useState<CollectTarget | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const run = useQuery({ queryKey: ['payments', 'run'], queryFn: getCurrentPaymentRun });

  const rows = run.data?.rows ?? [];
  const billed = rows.reduce((t, r) => t + r.totalDue, 0);
  const collected = rows.reduce((t, r) => t + r.amountPaid, 0);
  const outstanding = billed - collected;
  const settled = rows.filter((r) => r.status === 'PAID').length;

  const period = run.data
    ? `${formatDate(run.data.periodStart)} — ${formatDate(run.data.periodEnd)}`
    : '';

  const owing = (r: PaymentPeriodRow) => r.status !== 'PAID' && r.totalDue - r.amountPaid > 0;
  const openCollect = (r: PaymentPeriodRow) =>
    setCollect({
      riderId: r.riderId,
      riderName: r.riderName,
      totalDue: r.totalDue,
      amountPaid: r.amountPaid,
    });

  return (
    <>
      <PageHeader
        section="Money"
        title="Weekly payment run"
        meta={
          run.data ? (
            <Mono sx={{ fontSize: 12, color: neutral[500] }}>
              {run.data.billingDay === 'MONDAY' ? 'Monday cycle' : 'Wednesday cycle'} · {period}
            </Mono>
          ) : undefined
        }
      />

      <Box sx={{ mt: 4.5 }}>
        <StatTiles
          tiles={[
            { label: 'Riders billed', value: run.data ? String(rows.length) : '—' },
            { label: 'Total billed', value: run.data ? rupees(billed) : '—' },
            { label: 'Collected', value: run.data ? rupees(collected) : '—', tone: 'good' },
            {
              label: 'Outstanding',
              value: run.data ? rupees(outstanding) : '—',
              tone: outstanding > 0 ? 'bad' : 'good',
            },
            { label: 'Fully paid', value: run.data ? `${settled}/${rows.length}` : '—' },
          ]}
        />
      </Box>

      <Panel
        label="This period"
        subtitle={run.data ? `${rows.length} riders in the ${run.data.billingDay === 'MONDAY' ? 'Monday' : 'Wednesday'} cycle` : undefined}
        sx={{ mt: 5, p: { xs: '16px 12px 12px', sm: '18px 20px 14px' } }}
      >
        {run.isLoading ? (
          <EmptyState title="Loading the run…" />
        ) : rows.length === 0 ? (
          <EmptyState
            title="Nothing to bill this period"
            description="A rider appears here once they hold a bike on this billing day."
          />
        ) : stacked ? (
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            {rows.map((r) => (
              <Box
                key={r.riderId}
                onClick={() => navigate(`/payments/run/${r.riderId}`)}
                sx={{
                  py: 3.5,
                  cursor: 'pointer',
                  borderBottom: `1px solid ${neutral[900]}`,
                  '&:last-of-type': { border: 0 },
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 3 }}>
                  <Box>
                    <Typography sx={{ fontSize: 14 }}>{r.riderName}</Typography>
                    <Mono sx={{ fontSize: 12, color: neutral[500] }}>
                      {r.riderId} · {r.vehicleId}
                    </Mono>
                  </Box>
                  <StateChip label={PAYMENT_STATUS_LABEL[r.status]} tone={PAYMENT_STATUS_TONE[r.status]} />
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2 }}>
                  <Mono sx={{ fontSize: 13, color: neutral[400] }}>Due {rupees(r.totalDue)}</Mono>
                  <Mono sx={{ fontSize: 13, color: r.amountPaid === 0 ? neutral[600] : undefined }}>
                    Paid {rupees(r.amountPaid)}
                  </Mono>
                </Box>
                {owing(r) && (
                  <Button
                    color="inherit"
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      openCollect(r);
                    }}
                    sx={{ mt: 2 }}
                    fullWidth
                  >
                    Record payment
                  </Button>
                )}
              </Box>
            ))}
          </Box>
        ) : (
          <SimpleTable
            rows={rows}
            getRowKey={(r) => r.riderId}
            rowSx={() => ({ cursor: 'pointer', '&:hover td': { background: neutral[900] } })}
            columns={[
              {
                key: 'rider',
                header: 'Rider',
                width: 200,
                render: (r) => (
                  <Box onClick={() => navigate(`/payments/run/${r.riderId}`)}>
                    <Box component="span" sx={{ display: 'block' }}>{r.riderName}</Box>
                    <Mono sx={{ fontSize: 12, color: accent[300] }}>{r.riderId}</Mono>
                  </Box>
                ),
              },
              {
                key: 'vehicle',
                header: 'Vehicle',
                width: 120,
                render: (r) => <Mono sx={{ fontSize: 13, color: neutral[400] }}>{r.vehicleId}</Mono>,
              },
              ...(compact
                ? []
                : [
                    {
                      key: 'days',
                      header: 'Days',
                      align: 'right' as const,
                      width: 70,
                      render: (r: PaymentPeriodRow) => <Mono sx={{ color: neutral[400] }}>{r.daysBilled}</Mono>,
                    },
                    {
                      key: 'billed',
                      header: 'Billed',
                      align: 'right' as const,
                      width: 100,
                      render: (r: PaymentPeriodRow) => <Mono>{rupees(r.billedAmount)}</Mono>,
                    },
                    {
                      key: 'service',
                      header: 'Service',
                      align: 'right' as const,
                      width: 90,
                      render: (r: PaymentPeriodRow) => (
                        <Mono sx={{ color: r.serviceCharges === 0 ? neutral[600] : undefined }}>
                          {rupees(r.serviceCharges)}
                        </Mono>
                      ),
                    },
                    {
                      key: 'arrears',
                      header: 'Arrears',
                      align: 'right' as const,
                      width: 90,
                      render: (r: PaymentPeriodRow) => (
                        <Mono sx={{ color: r.arrears === 0 ? neutral[600] : 'inherit' }}>
                          {rupees(r.arrears)}
                        </Mono>
                      ),
                    },
                  ]),
              {
                key: 'due',
                header: 'Total due',
                align: 'right',
                width: 110,
                render: (r) => <Mono>{rupees(r.totalDue)}</Mono>,
              },
              {
                key: 'paid',
                header: 'Paid',
                align: 'right',
                width: 110,
                render: (r) => (
                  <Mono sx={{ color: r.amountPaid === 0 ? neutral[600] : undefined }}>
                    {rupees(r.amountPaid)}
                  </Mono>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                width: 110,
                render: (r) => (
                  <StateChip label={PAYMENT_STATUS_LABEL[r.status]} tone={PAYMENT_STATUS_TONE[r.status]} />
                ),
              },
              {
                key: 'action',
                header: '',
                align: 'right',
                width: 150,
                render: (r) =>
                  owing(r) ? (
                    <Button
                      color="inherit"
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        openCollect(r);
                      }}
                    >
                      Record payment
                    </Button>
                  ) : (
                    <Box component="span" sx={{ color: neutral[700], fontSize: 13 }}>Settled</Box>
                  ),
              },
            ]}
          />
        )}
      </Panel>

      <Typography sx={{ fontSize: 12, color: neutral[500], mt: 3 }}>
        Recording a payment updates this run, the rider's receipt and the overdue list at once. In the
        prototype it is an in-session write — the real ledger arrives with the backend.
      </Typography>

      <RecordPaymentDialog
        target={collect}
        onClose={() => setCollect(null)}
        onRecorded={() => setToast('Payment recorded')}
      />

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={2600}
        onClose={() => setToast(null)}
        message={toast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </>
  );
}
