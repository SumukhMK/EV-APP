import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { Mono } from '../../components/Mono';
import { StateChip } from '../../components/StateChip';
import { DefinitionList } from '../../components/DefinitionList';
import { listVehicles, VEHICLE_STATE_LABEL, VEHICLE_STATE_TONE } from '../../lib/api/vehicles';
import { listRiders } from '../../lib/api/riders';
import type { Rider } from '../../types';

export function AssignVehicle() {
  const { riderId = '' } = useParams();

  // Get bikes ready to deploy
  const vehicles = useQuery({
    queryKey: ['vehicles', 'ready-to-deploy'],
    queryFn: () => listVehicles({ state: 'READY_TO_DEPLOY' }),
    retry: false,
  });

  // Get active riders
  const ridersList = useQuery({
    queryKey: ['riders', 'list-all'],
    queryFn: () => listRiders({ status: 'ACTIVE' }),
    retry: false,
  });

  if (vehicles.isLoading) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 320 }}>
        <CircularProgress size={22} />
      </Box>
    );
  }

  const targetRider = riderId
    ? { id: riderId, name: 'Loading...', currentVehicleId: null as string | null }
    : { id: '', name: '', currentVehicleId: null as string | null };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <PageHeader
        section="Riders"
        title="Assign vehicle"
        actions={
          <Button component={Link} to="/riders">
            Cancel
          </Button>
        }
      />

      <Panel label="Rider">
        {riderId ? (
          <Box>
            <Typography variant="h6">Rider: {riderId}</Typography>
            <Box sx={{ mt: 2 }}>
              <StateChip label="Active" tone="good" />
            </Box>
          </Box>
        ) : (
          <Box>
            <Typography variant="h6">Select a rider</Typography>
            <TextField
              select
              label="Rider"
              value={targetRider.id}
              onChange={() => {}}
              fullWidth
              sx={{ mt: 2 }}
            >
              {ridersList.data?.content.map((r: Rider) => (
                <MenuItem key={r.id} value={r.id}>
                  {r.name} ({r.id})
                </MenuItem>
              ))}
            </TextField>
          </Box>
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

      <Panel label="Assignment summary">
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Typography variant="overline">Assign bike to rider</Typography>
          <DefinitionList
            columns={2}
            items={[
              { label: 'Rider', value: <Mono>{targetRider.id || 'Not selected'}</Mono> },
              { label: 'Bike', value: <Mono>{vehicles.data?.content[0]?.id || 'Not selected'}</Mono> },
              { label: 'Bike model', value: <Mono>{vehicles.data?.content[0]?.model || '—'}</Mono> },
            ]}
          />
          <Button variant="contained" sx={{ mt: 2, width: '100%' }} onClick={() => {}}>
            Assign bike
          </Button>
        </Box>
      </Panel>
    </Box>
  );
}
