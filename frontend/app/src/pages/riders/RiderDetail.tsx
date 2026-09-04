import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { StateChip } from '../../components/StateChip';
import { DefinitionList } from '../../components/DefinitionList';
import { Mono } from '../../components/Mono';
import { SimpleTable } from '../../components/SimpleTable';
import { EmptyState } from '../../components/EmptyState';
import { getRider } from '../../lib/api/riders';
import { RIDER_STATUS_LABEL, RIDER_STATUS_TONE, KYC_STATUS_LABEL, KYC_STATUS_TONE, PAYMENT_STATUS_LABEL, PAYMENT_STATUS_TONE } from '../../lib/labels';
import { formatDate, rupees } from '../../lib/format';
import { neutral, status as tones } from '../../theme/tokens';

export function RiderDetail() {
  const { riderId = '' } = useParams();

  const rider = useQuery({
    queryKey: ['rider', riderId],
    queryFn: () => getRider(riderId),
    retry: false,
  });

  if (rider.isLoading) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 320 }}>
        <CircularProgress size={22} />
      </Box>
    );
  }

  if (rider.isError || !rider.data) {
    return (
      <>
        <PageHeader section="Riders / Detail" title="Not found" />
        <EmptyState
          title={`No rider with id ${riderId}`}
          description="It may have been deactivated, or the link is stale."
          action={
            <Button component={Link} to="/riders">
              Back to rider register
            </Button>
          }
        />
      </>
    );
  }

  const r = rider.data;

  return (
    <>
      <PageHeader
        section="Riders / Detail"
        title={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
            <Mono sx={{ fontSize: { xs: 22, sm: 25, xl: 28 }, letterSpacing: 0 }}>{r.id}</Mono>
            <StateChip label={RIDER_STATUS_LABEL[r.status]} tone={RIDER_STATUS_TONE[r.status]} />
          </Box>
        }
        actions={
          <>
            <Button color="inherit" component={Link} to="/riders/onboard">
              Onboard
            </Button>
          </>
        }
      />

      <Box sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 372px' },
        gap: 5,
        mt: 5,
        alignItems: 'start',
      }}>
        <Panel label="Profile">
          <DefinitionList
            columns={2}
            items={[
              { label: 'Name', value: <Mono sx={{ fontSize: 13 }}>{r.name}</Mono> },
              { label: 'ID', value: <Mono sx={{ fontSize: 13 }}>{r.id}</Mono> },
              { label: 'Phone', value: <Mono sx={{ fontSize: 13 }}>{r.phone}</Mono> },
              { label: 'Status', value: <StateChip label={RIDER_STATUS_LABEL[r.status]} tone={RIDER_STATUS_TONE[r.status]} /> },
              { label: 'KYC', value: <StateChip label={KYC_STATUS_LABEL[r.kycStatus]} tone={KYC_STATUS_TONE[r.kycStatus]} /> },
              { label: 'Weekly plan', value: <Mono sx={{ fontSize: 13 }}>{rupees(r.planAmount)}</Mono> },
              { label: 'Billing day', value: r.billingDay === 'MONDAY' ? 'Monday' : 'Wednesday' },
              { label: 'Onboarded on', value: <Mono sx={{ fontSize: 13 }}>{formatDate(r.onboardedOn)}</Mono> },
              { label: 'Payment status', value: <StateChip label={PAYMENT_STATUS_LABEL[r.paymentStatus]} tone={PAYMENT_STATUS_TONE[r.paymentStatus]} /> },
            ]}
          />
        </Panel>

        <Panel label="Current bike" sx={{ display: 'flex', flexDirection: 'column', gap: 3.5 }}>
          {r.currentVehicleId ? (
            <>
              <Box>
                <Typography sx={{ fontSize: 19, fontWeight: 500 }}>Bike {r.currentVehicleId}</Typography>
                <Mono sx={{ fontSize: 13, color: neutral[400] }}>
                  Assigned since {formatDate(r.onboardedOn)}
                </Mono>
              </Box>
              <Button color="inherit" component={Link} to={`/vehicles/${r.currentVehicleId}`} fullWidth>
                View bike details
              </Button>
            </>
          ) : (
            <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>
              Not assigned. A bike can be assigned from{' '}
              <Box component="span" sx={{ color: tones.good.fg }}>
                Ready to deploy
              </Box>
              .
            </Typography>
          )}
        </Panel>

        <Panel label="Payment history" sx={{ mt: 5 }}>
          <SimpleTable
            rows={r.paymentHistory ?? []}
            getRowKey={(a) => `${a.id}-${a.date}`}
            columns={[
              { key: 'date', header: 'Date', width: 130, render: (a) => <Mono>{formatDate(a.date)}</Mono> },
              { key: 'amount', header: 'Amount', align: 'right', width: 130, render: (a) => <Mono>{rupees(a.amount)}</Mono> },
              { key: 'status', header: 'Status', width: 130, render: (a) => (
                <Box component="span" sx={{ color: a.status === 'OVERDUE' ? 'error' : undefined }}>
                  {a.status}
                </Box>
              ) },
              { key: 'method', header: 'Method', width: 130, render: (a) => a.method ?? '—' },
            ]}
          />
        </Panel>
      </Box>
    </>
  );
}