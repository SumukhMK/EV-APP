import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Snackbar from '@mui/material/Snackbar';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import ReceiptIcon from '@mui/icons-material/ReceiptLongOutlined';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { StateChip } from '../../components/StateChip';
import { DefinitionList } from '../../components/DefinitionList';
import { EmptyState } from '../../components/EmptyState';
import { Mono } from '../../components/Mono';
import { RecordPaymentDialog, type CollectTarget } from './RecordPaymentDialog';
import { getPaymentReceipt } from '../../lib/api/payments';
import {
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_TONE,
} from '../../lib/labels';
import { formatDate, rupees } from '../../lib/format';
import { neutral, status as tones } from '../../theme/tokens';

/**
 * A single rider's receipt for the current period (artboard 16).
 *
 * Every figure is restated from the run line, not recomputed, so the receipt
 * and the run cannot disagree. The lower block is the only thing a receipt
 * adds over the run: how the money came in, when, and against what reference —
 * and it is simply absent when nothing has been collected yet.
 */
export function PaymentReceipt() {
  const { riderId = '' } = useParams();
  const [collect, setCollect] = useState<CollectTarget | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const receipt = useQuery({
    queryKey: ['payments', 'receipt', riderId],
    queryFn: () => getPaymentReceipt(riderId),
    retry: false,
  });

  if (receipt.isLoading) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 320 }}>
        <CircularProgress size={22} />
      </Box>
    );
  }

  if (receipt.isError || !receipt.data) {
    return (
      <>
        <PageHeader section="Money" title="No receipt" />
        <EmptyState
          title={`No line for ${riderId} in this period`}
          description="Either the rider is not billed on this cycle, or the link is stale."
          action={
            <Button component={Link} to="/payments/run">
              Back to the run
            </Button>
          }
        />
      </>
    );
  }

  const r = receipt.data;
  const paid = r.amountPaid > 0;
  const settled = r.status === 'PAID';

  return (
    <>
      <PageHeader
        section="Money"
        icon={ReceiptIcon}
        title={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
            <Box component="span">Receipt</Box>
            <StateChip label={PAYMENT_STATUS_LABEL[r.status]} tone={PAYMENT_STATUS_TONE[r.status]} />
          </Box>
        }
        meta={
          <Mono sx={{ fontSize: 12, color: neutral[500] }}>
            {r.receiptNo ?? 'Not issued'}
          </Mono>
        }
        actions={
          <>
            {r.balance > 0 && (
              <Button
                onClick={() =>
                  setCollect({
                    riderId: r.riderId,
                    riderName: r.riderName,
                    totalDue: r.totalDue,
                    amountPaid: r.amountPaid,
                  })
                }
              >
                Record payment
              </Button>
            )}
            <Button color="inherit" component={Link} to={`/riders/${r.riderId}`}>
              Open rider
            </Button>
          </>
        }
      />

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 372px' },
          gap: 5,
          mt: 5,
          alignItems: 'start',
        }}
      >
        <Panel label="Charges" subtitle={`${formatDate(r.periodStart)} — ${formatDate(r.periodEnd)}`}>
          <DefinitionList
            items={[
              {
                label: `Weekly rent · ${r.daysBilled} of 7 days`,
                value: <Mono sx={{ fontSize: 13 }}>{rupees(r.billedAmount)}</Mono>,
              },
              {
                label: 'Service charges',
                value: (
                  <Mono sx={{ fontSize: 13, color: r.serviceCharges === 0 ? neutral[500] : undefined }}>
                    {rupees(r.serviceCharges)}
                  </Mono>
                ),
              },
              {
                label: 'Arrears carried in',
                value: (
                  <Mono sx={{ fontSize: 13, color: r.arrears === 0 ? neutral[500] : undefined }}>
                    {rupees(r.arrears)}
                  </Mono>
                ),
              },
            ]}
          />
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              mt: 4,
              pt: 3,
              borderTop: `1px solid ${neutral[800]}`,
            }}
          >
            <Typography sx={{ fontSize: 14 }}>Total due</Typography>
            <Mono sx={{ fontSize: 18 }}>{rupees(r.totalDue)}</Mono>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
            <Typography sx={{ fontSize: 13, color: neutral[400] }}>Paid</Typography>
            <Mono sx={{ fontSize: 13, color: paid ? tones.good.fg : neutral[500] }}>
              {rupees(r.amountPaid)}
            </Mono>
          </Box>
          {r.balance > 0 && (
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
              <Typography sx={{ fontSize: 13, color: neutral[400] }}>Balance</Typography>
              <Mono sx={{ fontSize: 13, color: tones.bad.fg }}>{rupees(r.balance)}</Mono>
            </Box>
          )}
        </Panel>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <Panel label="Rider">
            <DefinitionList
              items={[
                { label: 'Name', value: r.riderName },
                { label: 'Rider id', value: <Mono sx={{ fontSize: 13 }}>{r.riderId}</Mono> },
                { label: 'Vehicle', value: <Mono sx={{ fontSize: 13 }}>{r.vehicleId}</Mono> },
                { label: 'Billing day', value: r.billingDay === 'MONDAY' ? 'Monday' : 'Wednesday' },
                { label: 'Weekly plan', value: <Mono sx={{ fontSize: 13 }}>{rupees(r.planAmount)}</Mono> },
              ]}
            />
          </Panel>

          <Panel label="Payment">
            {paid ? (
              <DefinitionList
                items={[
                  {
                    label: 'Method',
                    value: r.method ? PAYMENT_METHOD_LABEL[r.method] : '—',
                  },
                  {
                    label: 'Received on',
                    value: <Mono sx={{ fontSize: 13 }}>{r.paidOn ? formatDate(r.paidOn) : '—'}</Mono>,
                  },
                  {
                    label: 'Reference',
                    value: (
                      <Mono sx={{ fontSize: 12, color: r.reference ? undefined : neutral[500] }}>
                        {r.reference ?? '—'}
                      </Mono>
                    ),
                  },
                ]}
              />
            ) : (
              <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>
                Nothing collected against this period yet. Recording a payment is a backend action and
                is not wired in the prototype.
              </Typography>
            )}
          </Panel>
        </Box>
      </Box>

      <Typography sx={{ fontSize: 12, color: neutral[500], mt: 5 }}>
        {settled
          ? 'This period is settled.'
          : 'Late fees and the ₹5,000 deposit are held on the rider ledger, not on a single receipt — shown once those rules are confirmed with Ashok.'}
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
