import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../../app/sessionContext';
import { Link, useLocation, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { StateChip } from '../../components/StateChip';
import { DefinitionList } from '../../components/DefinitionList';
import { Mono } from '../../components/Mono';
import { ArrivalNotice } from '../../components/ArrivalNotice';
import { SimpleTable } from '../../components/SimpleTable';
import { EmptyState } from '../../components/EmptyState';
import { decideKyc, getRider, listRiderPayments } from '../../lib/api/riders';
import { getVehicle } from '../../lib/api/vehicles';
import { invalidateRiders } from '../../lib/invalidate';
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
  EXCHANGE_REASON_LABEL,
  DEBOARD_REASON_LABEL,
} from '../../lib/labels';
import { formatDate, rupees } from '../../lib/format';
import { neutral, status as tones } from '../../theme/tokens';

/**
 * Why a bike came back, whichever end it came from.
 *
 * The assignment row's `reason` column holds both enums — an exchange reason
 * and a deboard reason share it, because they answer the same question at
 * different moments. This panel lists both, so it needs one lookup that
 * covers either.
 *
 * Deliberately here rather than in `lib/labels.ts`: that module is in the
 * initial bundle, which sits within a hair of its 200KB budget, and this map
 * is read by exactly one lazily-loaded screen. A constant used by one route
 * belongs in that route's chunk.
 */
const RETURN_REASON_LABEL: Record<string, string> = {
  ...EXCHANGE_REASON_LABEL,
  ...DEBOARD_REASON_LABEL,
};

export function RiderDetail() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const { riderId = '' } = useParams();
  const { pathname: herePath } = useLocation();



  /**
   * The KYC decision.
   *
   * kycStatus was written once at onboarding and nothing could ever change
   * it, so every rider's chip read "KYC pending" for ever — which looks like
   * a queue somebody is working through rather than a dead end.
   */
  // SA/FA only, matching the endpoint. Judging someone's documents is not a
  // counter task, and the rest of the register being open to staff does not
  // make this so.
  const canDecideKyc = user.roleKey === 'SUPER_ADMIN' || user.roleKey === 'FLEET_ADMIN';

  const kyc = useMutation({
    mutationFn: (decision: 'VERIFIED' | 'REJECTED') => decideKyc(riderId, decision),
    onSuccess: () => invalidateRiders(queryClient),
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

  return (
    <>
      <ArrivalNotice />
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
              <Button color="inherit" component={Link} to={`/assignments/exchange?riderId=${r.id}`} state={{ returnTo: herePath }}>
                Exchange bike
              </Button>
              <Button color="inherit" component={Link} to={`/assignments/deboard?riderId=${r.id}`} state={{ returnTo: herePath }}>
                Deboard
              </Button>
            </>
          ) : (
            <Button component={Link} to={`/assignments/assign?riderId=${r.id}`} state={{ returnTo: herePath }}>
              Assign bike
            </Button>
          )
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
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                    <StateChip label={KYC_STATUS_LABEL[r.kycStatus]} tone={KYC_STATUS_TONE[r.kycStatus]} />
                    {/* The decision, where the status is read. Documents are
                        judged while looking at the rider, not on a queue
                        screen somewhere else. */}
                    {canDecideKyc && r.kycStatus !== 'VERIFIED' && (
                      <Button size="small" disabled={kyc.isPending} onClick={() => kyc.mutate('VERIFIED')}>
                        Verify
                      </Button>
                    )}
                    {canDecideKyc && r.kycStatus !== 'REJECTED' && (
                      <Button
                        size="small"
                        color="inherit"
                        disabled={kyc.isPending}
                        onClick={() => kyc.mutate('REJECTED')}
                      >
                        Reject
                      </Button>
                    )}
                  </Box>
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
                <>
              No bike yet. A bike can only be given out when it is{' '}
                  <Box component="span" sx={{ color: tones.accent.fg }}>
                    Ready to Deploy
                  </Box>
                  .
                </>
            </Typography>
          )}
        </Panel>
      </Box>

      <Panel
        label="Identity and address"
        subtitle="Collected during onboarding. A dash means a rider onboarded before the register kept this."
        sx={{ mt: 5 }}
      >
        <DefinitionList
          columns={2}
          items={[
            { label: 'Permanent address', value: r.permanentAddress || '—' },
            { label: 'Local address', value: r.localAddress || '—' },
            { label: 'City', value: r.city || '—' },
            { label: 'State', value: r.state || '—' },
            { label: 'PIN', value: r.pinCode ? <Mono sx={{ fontSize: 13 }}>{r.pinCode}</Mono> : '—' },
            { label: 'WhatsApp', value: r.whatsappNumber ? <Mono sx={{ fontSize: 13 }}>{r.whatsappNumber}</Mono> : '—' },
            {
              label: 'Alternate number',
              value: r.alternateNumber1 ? <Mono sx={{ fontSize: 13 }}>{r.alternateNumber1}</Mono> : '—',
            },
            { label: 'PAN', value: r.panNumber ? <Mono sx={{ fontSize: 13 }}>{r.panNumber}</Mono> : '—' },
            {
              label: 'Driving licence',
              value: r.drivingLicence ? <Mono sx={{ fontSize: 13 }}>{r.drivingLicence}</Mono> : '—',
            },
            { label: 'Platform rider id', value: r.platformRiderId || '—' },
            {
              label: 'Deposit paid',
              // Against the plan beside it: the two differ while a rider pays
              // a deposit in instalments, and that difference is money owed.
              value: r.depositPaid == null ? '—' : <Mono sx={{ fontSize: 13 }}>{rupees(r.depositPaid)}</Mono>,
            },
          ]}
        />
      </Panel>

      <Panel
        label="Bike history"
        subtitle="Every bike this rider has held, newest first. The open one has no return date."
        collapsible
        defaultOpen={false}
        sx={{ mt: 5 }}
      >
        {(r.assignments ?? []).length === 0 ? (
          <Typography sx={{ fontSize: 14, color: 'text.secondary', py: 4 }}>
            This rider has never held a bike.
          </Typography>
        ) : (
          <Box
            component="ul"
            aria-label="Bikes this rider has held"
            sx={{ listStyle: 'none', m: 0, p: 0, mt: 2 }}
          >
            {(r.assignments ?? []).map((a, i) => {
              const last = i === (r.assignments ?? []).length - 1;
              return (
                <Box component="li" key={`${a.vehicleId}-${a.startedOn}`} sx={{ display: 'flex', gap: 2.5 }}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <Box
                      sx={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        mt: '6px',
                        // Open rows are the rider's current bike; closed rows
                        // are the past. The border is the panel's own paper
                        // colour, so the dot reads as a ring on the rail.
                        background: a.endedOn ? neutral[600] : tones.accent.fg,
                        border: '2px solid',
                        borderColor: 'background.default',
                      }}
                    />
                    {!last && <Box sx={{ width: 2, flex: 1, minHeight: 40, background: neutral[800], my: 1 }} />}
                  </Box>
                  <Box sx={{ pb: last ? 1 : 4, flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 2, flexWrap: 'wrap' }}>
                      <Mono sx={{ fontSize: 15 }}>{a.vehicleId}</Mono>
                      {a.endedOn ? (
                        <Typography sx={{ fontSize: 13, color: neutral[500] }}>
                          From {formatDate(a.startedOn)} → {formatDate(a.endedOn)} · {a.days} days
                        </Typography>
                      ) : (
                        <Typography sx={{ fontSize: 13, color: tones.accent.fg }}>
                          From {formatDate(a.startedOn)} · On this bike now · {a.days} days
                        </Typography>
                      )}
                    </Box>
                    {a.endedOn && (
                      <Typography sx={{ fontSize: 13, color: neutral[400], mt: '3px' }}>
                        {a.reason ? `Why it came back: ${RETURN_REASON_LABEL[a.reason] ?? a.reason}` : 'Why it came back: —'}
                        {a.closedBy ? ` · Closed by ${a.closedBy}` : ''}
                      </Typography>
                    )}
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}
      </Panel>

      <Panel
        label="Payment history"
        subtitle={
          holdsBike ? 'The eight most recent billing periods, newest first.' : undefined
        }
        collapsible
        defaultOpen={false}
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
