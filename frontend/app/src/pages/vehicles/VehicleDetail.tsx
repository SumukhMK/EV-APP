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
import { getVehicle } from '../../lib/api/vehicles';
import { getRider } from '../../lib/api/riders';
import { VEHICLE_STATE_LABEL, VEHICLE_STATE_TONE, PAYMENT_STATUS_LABEL, PAYMENT_STATUS_TONE } from '../../lib/labels';
import { formatDate, rupees } from '../../lib/format';
import { neutral, status as tones } from '../../theme/tokens';

export function VehicleDetail() {
  const { vehicleId = '' } = useParams();

  const vehicle = useQuery({
    queryKey: ['vehicle', vehicleId],
    queryFn: () => getVehicle(vehicleId),
    retry: false,
  });

  const rider = useQuery({
    queryKey: ['rider', vehicle.data?.currentRiderId],
    queryFn: () => getRider(vehicle.data!.currentRiderId!),
    enabled: Boolean(vehicle.data?.currentRiderId),
  });

  if (vehicle.isLoading) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 320 }}>
        <CircularProgress size={22} />
      </Box>
    );
  }

  if (vehicle.isError || !vehicle.data) {
    return (
      <>
        <PageHeader section="Fleet / Vehicles" title="Not found" />
        <EmptyState
          title={`No vehicle with id ${vehicleId}`}
          description="It may have been retired, or the link is stale."
          action={
            <Button component={Link} to="/vehicles">
              Back to vehicles
            </Button>
          }
        />
      </>
    );
  }

  const v = vehicle.data;

  return (
    <>
      <PageHeader
        section="Fleet / Vehicles"
        title={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <Mono sx={{ fontSize: 25, letterSpacing: 0 }}>{v.id}</Mono>
            <StateChip label={VEHICLE_STATE_LABEL[v.state]} tone={VEHICLE_STATE_TONE[v.state]} />
          </Box>
        }
        actions={
          <>
            <Button color="inherit" component={Link} to="/assignments/exchange">
              Exchange
            </Button>
            <Button color="inherit" component={Link} to={`/inspections?vehicle=${v.id}`}>
              Inspection
            </Button>
          </>
        }
      />

      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 372px', gap: 5, mt: 5, alignItems: 'start' }}>
        <Panel label="Specification">
          <DefinitionList
            columns={2}
            items={[
              { label: 'Chassis', value: <Mono sx={{ fontSize: 13 }}>{v.chassisNumber}</Mono> },
              { label: 'Make', value: v.make },
              { label: 'Model', value: v.model },
              { label: 'Battery', value: v.batteryType === 'SWAPPABLE' ? 'Sun Mobility' : 'Fixed pack' },
              { label: 'Motor number', value: <Mono sx={{ fontSize: 13 }}>{v.motorNumber ?? '—'}</Mono> },
              { label: 'Controller number', value: <Mono sx={{ fontSize: 13 }}>{v.controllerNumber ?? '—'}</Mono> },
              { label: 'RFID tag', value: <Mono sx={{ fontSize: 13 }}>{v.rfidTag ?? '—'}</Mono> },
              { label: 'Hub', value: v.hub },
            ]}
          />
        </Panel>

        <Panel label={v.currentRiderName ? 'Current rider' : 'Rider'} sx={{ display: 'flex', flexDirection: 'column', gap: 3.5 }}>
          {v.currentRiderName ? (
            <>
              <Box>
                <Typography sx={{ fontSize: 19 }}>{v.currentRiderName}</Typography>
                <Mono sx={{ fontSize: 13, color: neutral[400] }}>
                  {v.currentRiderId}
                  {rider.data ? ` · ${rider.data.phone}` : ''}
                </Mono>
              </Box>
              <DefinitionList
                divider="top"
                items={[
                  {
                    label: 'Weekly plan',
                    value: <Mono sx={{ fontSize: 13 }}>{rider.data ? rupees(rider.data.planAmount) : '—'}</Mono>,
                  },
                  {
                    label: 'Payment day',
                    value: rider.data ? (rider.data.billingDay === 'MONDAY' ? 'Monday' : 'Wednesday') : '—',
                  },
                  {
                    label: 'Assigned since',
                    value: <Mono sx={{ fontSize: 13 }}>{rider.data ? formatDate(rider.data.onboardedOn) : '—'}</Mono>,
                  },
                  {
                    label: 'Payment status',
                    value: rider.data ? (
                      <StateChip
                        label={PAYMENT_STATUS_LABEL[rider.data.paymentStatus]}
                        tone={PAYMENT_STATUS_TONE[rider.data.paymentStatus]}
                      />
                    ) : (
                      '—'
                    ),
                  },
                ]}
              />
              <Button color="inherit" component={Link} to={`/riders/${v.currentRiderId}`} fullWidth>
                Open rider record
              </Button>
            </>
          ) : (
            <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>
              Not assigned. A bike can be assigned only from{' '}
              <Box component="span" sx={{ color: tones.good.fg }}>
                Ready to deploy
              </Box>
              .
            </Typography>
          )}
        </Panel>
      </Box>

      <Panel label="Lifecycle" sx={{ mt: 5 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', mt: 4 }}>
          {v.lifecycle.map((s, i) => (
            <Box key={`${s.state}-${s.occurredOn}-${i}`} sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              <Box sx={{ height: '1px', background: neutral[800] }} />
              <Box
                sx={{
                  width: 9,
                  height: 9,
                  borderRadius: '50%',
                  mt: '-14px',
                  background: tones[VEHICLE_STATE_TONE[s.state]].fg,
                }}
              />
              <Typography sx={{ fontSize: 13, color: tones[VEHICLE_STATE_TONE[s.state]].fg }}>
                {VEHICLE_STATE_LABEL[s.state]}
              </Typography>
              <Mono sx={{ fontSize: 11, color: neutral[500] }}>{formatDate(s.occurredOn)}</Mono>
            </Box>
          ))}
        </Box>
      </Panel>

      <Panel label="Assignment history" sx={{ mt: 5 }}>
        {v.assignments.length === 0 ? (
          <Typography sx={{ fontSize: 14, color: 'text.secondary', py: 4 }}>
            This bike has never been assigned.
          </Typography>
        ) : (
          <SimpleTable
            rows={v.assignments}
            getRowKey={(a) => `${a.riderId}-${a.startedOn}`}
            columns={[
              { key: 'rider', header: 'Rider', render: (a) => a.riderName },
              { key: 'riderId', header: 'Rider id', width: 110, render: (a) => <Mono>{a.riderId}</Mono> },
              {
                key: 'plan',
                header: 'Plan',
                align: 'right',
                width: 110,
                render: (a) => <Mono>{rupees(a.planAmount)}</Mono>,
              },
              { key: 'start', header: 'Start', width: 140, render: (a) => <Mono>{formatDate(a.startedOn)}</Mono> },
              {
                key: 'end',
                header: 'End',
                width: 140,
                render: (a) => (
                  <Mono sx={{ color: a.endedOn ? undefined : neutral[500] }}>
                    {a.endedOn ? formatDate(a.endedOn) : 'Active'}
                  </Mono>
                ),
              },
              { key: 'days', header: 'Days', align: 'right', width: 80, render: (a) => <Mono>{a.days}</Mono> },
              {
                key: 'closedBy',
                header: 'Closed by',
                width: 170,
                render: (a) => (
                  <Box component="span" sx={{ color: a.closedBy ? undefined : neutral[500] }}>
                    {a.closedBy ?? '—'}
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
