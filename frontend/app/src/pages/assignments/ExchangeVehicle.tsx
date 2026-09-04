import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { Mono } from '../../components/Mono';
import { StateChip } from '../../components/StateChip';
import { DefinitionList } from '../../components/DefinitionList';
import { listVehicles, getVehicle, VEHICLE_STATE_LABEL, VEHICLE_STATE_TONE } from '../../lib/api/vehicles';
import { getRider } from '../../lib/api/riders';

export function ExchangeVehicle() {
  const { riderId = '' } = useParams();

  // Load the current rider
  const rider = useQuery({
    queryKey: ['rider', riderId],
    queryFn: () => getRider(riderId),
    enabled: Boolean(riderId),
    retry: false,
  });

  // Get bikes ready to deploy
  const vehicles = useQuery({
    queryKey: ['vehicles', 'ready-to-deploy'],
    queryFn: () => listVehicles({ state: 'READY_TO_DEPLOY' }),
    retry: false,
  });

  // Get currently assigned bike for this rider
  const currentBike = useQuery({
    queryKey: ['vehicle', rider.data?.currentVehicleId],
    queryFn: () => getVehicle(rider.data!.currentVehicleId!),
    enabled: Boolean(rider.data?.currentVehicleId),
    retry: false,
  });

  if (vehicles.isLoading || rider.isLoading) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 320 }}>
        <CircularProgress size={22} />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <PageHeader
        section="Riders"
        title="Exchange vehicle"
        actions={
          <Button component={Link} to="/riders">
            Cancel
          </Button>
        }
      />

      <Panel label="Current assignment">
        {rider.data ? (
          <Box>
            <Typography variant="h6">
              {rider.data.name} ({rider.data.id})
            </Typography>
            <Box sx={{ mt: 3, display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Mono>{rider.data.currentVehicleId}</Mono>
              <Box>
                <StateChip
                  label={currentBike.data?.state ? VEHICLE_STATE_LABEL[currentBike.data.state] : '—'}
                  tone={currentBike.data?.state ? VEHICLE_STATE_TONE[currentBike.data.state] : 'neutral'}
                />
              </Box>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                Assigned: {rider.data.onboardedOn ? rider.data.onboardedOn : '—'}
              </Typography>
            </Box>
          </Box>
        ) : (
          <Typography sx={{ color: 'text.secondary' }}>This rider has no bike assigned.</Typography>
        )}
      </Panel>

      <Panel label="Available bikes (Ready to deploy)">
        <Box sx={{ mt: 3 }}>
          {vehicles.data?.content.length === 0 ? (
            <Typography sx={{ color: 'text.secondary' }}>No bikes currently ready to deploy.</Typography>
          ) : (
            <Box>
              {/* Header row */}
              <Box sx={{ display: 'flex', borderBottom: '1px solid', borderColor: 'divider', pb: 1, mb: 1 }}>
                <Box sx={{ flex: 1, fontWeight: 500, fontSize: 13 }}>Bike id</Box>
                <Box sx={{ width: 200, fontWeight: 500, fontSize: 13 }}>Model</Box>
                <Box sx={{ width: 150, fontWeight: 500, fontSize: 13 }}>State</Box>
              </Box>
              {/* Data rows */}
              {vehicles.data.content.map((bike) => (
                <Box
                  key={bike.id}
                  sx={{ display: 'flex', borderBottom: '1px solid', borderColor: 'divider', py: 1 }}
                >
                  <Box sx={{ flex: 1 }}><Mono>{bike.id}</Mono></Box>
                  <Box sx={{ width: 200 }}>{bike.model}</Box>
                  <Box sx={{ width: 150 }}>
                    <StateChip
                      label={VEHICLE_STATE_LABEL[bike.state]}
                      tone={VEHICLE_STATE_TONE[bike.state]}
                    />
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </Panel>

      <Panel label="Exchange summary">
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Typography variant="overline">Swap rider to new bike</Typography>
          <DefinitionList
            columns={2}
            items={[
              { label: 'Current bike', value: <Mono>{rider.data?.currentVehicleId || 'None'}</Mono> },
              { label: 'New bike', value: <Mono>{vehicles.data?.content[0]?.id || 'Not selected'}</Mono> },
              { label: 'Exchange type', value: <Mono>Open assignment + close old</Mono> },
            ]}
          />
          <Button variant="contained" sx={{ mt: 2, width: '100%' }} onClick={() => {}}>
            Execute exchange
          </Button>
        </Box>
      </Panel>
    </Box>
  );
}
