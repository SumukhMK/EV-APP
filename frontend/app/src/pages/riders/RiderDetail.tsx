import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { StateChip } from '../../components/StateChip';
import { DefinitionList } from '../../components/DefinitionList';
import { Mono } from '../../components/Mono';
import { SimpleTable } from '../../components/SimpleTable';
import { EmptyState } from '../../components/EmptyState';
import { getRider, listRiderPayments, reactivateRider } from '../../lib/api/riders';
import { getVehicle } from '../../lib/api/vehicles';
import {
  KYC_STATUS_LABEL,
  KYC_STATUS_TONE,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_TONE,
  RIDER_STATUS_LABEL,
  RIDER_STATUS_TONE,
  VEHICLE_STATE_LABEL,
  VEHICLE_STATE_TONE,
  RETURN_REASON_LABEL,
} from '../../lib/labels';
import { formatDate, rupees } from '../../lib/format';
import { neutral, status as tones } from '../../theme/tokens';

export function RiderDetail() {
  const queryClient = useQueryClient();
  const { riderId = '' } = useParams();

  /**
   * The way back onto the register.
   *
   * Deboarding used to be a one-way door: it is the only writer of DEBOARDED,
   * the assignable list filters on ACTIVE, and re-onboarding — which the copy
   * below used to offer as the remedy — is refused because the phone number is
   * already on the register. So a rider who handed a bike back could never be
   * given another one.
   */
  const putBack = useMutation({
    mutationFn: () => reactivateRider(riderId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['riders'] }),
  });


  const rider = useQuery({
    queryKey: ['rider', riderId],
    queryFn: () => getRider(riderId),
    retry: false,
  });

  // The bike is fetched rather than trusted from the rider row, because its
  // state is the thing that decides whether Exchange is even offerable.
  const bike = useQuery({
    queryKey: ['vehicle', rider.data?.currentVehicleId],
    queryFn: () => getVehicle(rider.data!.currentVehicleId!),
    enabled: Boolean(rider.data?.currentVehicleId),
  });

  const payments = useQuery({
    queryKey: ['rider', riderId, 'payments'],
    queryFn: () => listRiderPayments(riderId),
    enabled: Boolean(rider.data),
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
        <PageHeader section="Riders" title="Not found" />
        <EmptyState
          title={`No rider with id ${riderId}`}
          description="They may have been deboarded, or the link is stale."
          action={
            <Button component={Link} to="/riders">
              Back to the register
            </Button>
          }
        />
      </>
    );
  }

  const r = rider.data;
  const holdsBike = Boolean(r.currentVehicleId);
  // A deboarded or blacklisted rider cannot take a bike — the API refuses it —
  // so the action is not offered. Never present and dead.
  const canTakeBike = r.status === 'ACTIVE';

  return (
    <>
      <PageHeader
        section="Riders"
        backTo="/riders"
        backLabel="Back to riders"
        title={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
            <Box component="span">{r.name}</Box>
            <StateChip label={RIDER_STATUS_LABEL[r.status]} tone={RIDER_STATUS_TONE[r.status]} />
          </Box>
        }
        actions={
          // Which of the three events applies is decided by whether the rider
          // is holding a bike, so only the applicable ones are offered. The
          // rider is carried in the URL: these screens are reachable directly.
          holdsBike ? (
            <>
              <Button color="inherit" component={Link} to={`/assignments/exchange?riderId=${r.id}`}>
                Exchange bike
              </Button>
              <Button color="inherit" component={Link} to={`/assignments/deboard?riderId=${r.id}`}>
                Deboard
              </Button>
            </>
          ) : canTakeBike ? (
            <Button component={Link} to={`/assignments/assign?riderId=${r.id}`}>
              Assign bike
            </Button>
          ) : r.status === 'DEBOARDED' ? (
            <Button onClick={() => putBack.mutate()} disabled={putBack.isPending}>
              {putBack.isPending ? 'Putting back…' : 'Put back on register'}
            </Button>
          ) : undefined
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
        <Panel label="Profile">
          <DefinitionList
            columns={2}
            items={[
              { label: 'Rider id', value: <Mono sx={{ fontSize: 13 }}>{r.id}</Mono> },
              { label: 'Phone', value: <Mono sx={{ fontSize: 13 }}>{r.phone}</Mono> },
              {
                label: 'KYC',
                value: (
                  <StateChip label={KYC_STATUS_LABEL[r.kycStatus]} tone={KYC_STATUS_TONE[r.kycStatus]} />
                ),
              },
              {
                label: 'Payment status',
                value: (
                  <StateChip
                    label={PAYMENT_STATUS_LABEL[r.paymentStatus]}
                    tone={PAYMENT_STATUS_TONE[r.paymentStatus]}
                  />
                ),
              },
              { label: 'Mode of payment', value: PAYMENT_METHOD_LABEL[r.paymentMode] },
              { label: 'Weekly plan', value: <Mono sx={{ fontSize: 13 }}>{rupees(r.planAmount)}</Mono> },
              { label: 'Billing day', value: r.billingDay === 'MONDAY' ? 'Monday' : 'Wednesday' },
              {
                label: 'Onboarded on',
                value: <Mono sx={{ fontSize: 13 }}>{formatDate(r.onboardedOn)}</Mono>,
              },
            ]}
          />
        </Panel>

        <Panel
          label={holdsBike ? 'Current bike' : 'Bike'}
          sx={{ display: 'flex', flexDirection: 'column', gap: 3.5 }}
        >
          {holdsBike ? (
            <>
              <Box>
                <Mono sx={{ fontSize: 19 }}>{r.currentVehicleId}</Mono>
                <Typography sx={{ fontSize: 13, color: neutral[400], mt: '3px' }}>
                  {bike.data ? `${bike.data.make} ${bike.data.model}` : '—'}
                </Typography>
              </Box>
              <DefinitionList
                divider="top"
                items={[
                  {
                    label: 'State',
                    value: bike.data ? (
                      <StateChip
                        label={VEHICLE_STATE_LABEL[bike.data.state]}
                        tone={VEHICLE_STATE_TONE[bike.data.state]}
                      />
                    ) : (
                      '—'
                    ),
                  },
                  { label: 'Hub', value: bike.data?.hub ?? '—' },
                  {
                    label: 'Assigned since',
                    value: <Mono sx={{ fontSize: 13 }}>{formatDate(r.onboardedOn)}</Mono>,
                  },
                ]}
              />
              <Button color="inherit" component={Link} to={`/vehicles/${r.currentVehicleId}`} fullWidth>
                Open bike record
              </Button>
            </>
          ) : (
            <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>
              {canTakeBike ? (
                <>
                  No bike yet. A bike can only be given out when it is{' '}
                  <Box component="span" sx={{ color: tones.accent.fg }}>
                    Ready to Deploy
                  </Box>
                  .
                </>
              ) : (
                <>
                  This rider is {RIDER_STATUS_LABEL[r.status].toLowerCase()} and cannot hold a bike.{' '}
                  {r.status === 'BLACKLISTED'
                    ? 'A blacklisted rider is not put back on the register.'
                    : 'Put them back on the register to give them another bike.'}
                </>
              )}
            </Typography>
          )}
        </Panel>
      </Box>

      <Panel
        label="Bike history"
        subtitle="Every bike this rider has held, newest first. The open one has no return date."
        sx={{ mt: 5 }}
      >
        {(r.assignments ?? []).length === 0 ? (
          <Typography sx={{ fontSize: 14, color: 'text.secondary', py: 4 }}>
            This rider has never held a bike.
          </Typography>
        ) : (
          <SimpleTable
            rows={r.assignments ?? []}
            getRowKey={(a) => `${a.vehicleId}-${a.startedOn}`}
            columns={[
              { key: 'vehicle', header: 'Bike', width: 130, render: (a) => <Mono>{a.vehicleId}</Mono> },
              { key: 'from', header: 'From', width: 130, render: (a) => <Mono>{formatDate(a.startedOn)}</Mono> },
              {
                key: 'to',
                header: 'To',
                width: 130,
                // An open assignment has no return date. Saying so beats an
                // empty cell, which reads as missing data rather than current.
                render: (a) =>
                  a.endedOn ? (
                    <Mono>{formatDate(a.endedOn)}</Mono>
                  ) : (
                    <Box component="span" sx={{ fontSize: 13, color: tones.accent.fg }}>On this bike now</Box>
                  ),
              },
              { key: 'days', header: 'Days', align: 'right', width: 70, render: (a) => <Mono>{a.days}</Mono> },
              {
                key: 'reason',
                header: 'Why it came back',
                width: 170,
                render: (a) => (a.reason ? RETURN_REASON_LABEL[a.reason] ?? a.reason : '—'),
              },
              { key: 'closedBy', header: 'Closed by', width: 150, render: (a) => a.closedBy ?? '—' },
            ]}
          />
        )}
      </Panel>

      <Panel
        label="Payment history"
        subtitle={
          holdsBike ? 'The eight most recent billing periods, newest first.' : undefined
        }
        sx={{ mt: 5 }}
      >
        {payments.isLoading ? (
          <Box sx={{ display: 'grid', placeItems: 'center', py: 8 }}>
            <CircularProgress size={18} />
          </Box>
        ) : (payments.data ?? []).length === 0 ? (
          <Typography sx={{ fontSize: 14, color: 'text.secondary', py: 4 }}>
            {holdsBike
              ? 'No billing period has closed for this rider yet.'
              : 'No open plan. Rent is billed for as long as a bike is assigned.'}
          </Typography>
        ) : (
          <SimpleTable
            rows={payments.data ?? []}
            getRowKey={(p) => p.id}
            columns={[
              { key: 'period', header: 'Period', width: 150, render: (p) => <Mono>{formatDate(p.periodStart)}</Mono> },
              { key: 'due', header: 'Due', align: 'right', width: 130, render: (p) => <Mono>{rupees(p.totalDue)}</Mono> },
              {
                key: 'paid',
                header: 'Paid',
                align: 'right',
                width: 130,
                render: (p) => (
                  <Mono sx={{ color: p.amountPaid === 0 ? neutral[500] : undefined }}>
                    {rupees(p.amountPaid)}
                  </Mono>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                width: 130,
                render: (p) => (
                  <StateChip label={PAYMENT_STATUS_LABEL[p.status]} tone={PAYMENT_STATUS_TONE[p.status]} />
                ),
              },
              {
                key: 'method',
                header: 'Method',
                width: 150,
                render: (p) => (
                  <Box component="span" sx={{ color: p.method ? undefined : neutral[500] }}>
                    {p.method ? PAYMENT_METHOD_LABEL[p.method] : '—'}
                  </Box>
                ),
              },
            ]}
          />
        )}
      </Panel>
    </>
  );
}
