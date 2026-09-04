import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { Mono } from '../../components/Mono';
import { StateChip } from '../../components/StateChip';
import { DefinitionList } from '../../components/DefinitionList';
import { getVehicle, VEHICLE_STATE_LABEL, VEHICLE_STATE_TONE } from '../../lib/api/vehicles';
import { getRider } from '../../lib/api/riders';
import { formatDate } from '../../lib/format';

export function DeboardRider() {
  const { riderId = '' } = useParams();

  const [condition, setCondition] = useState('NONE');
  const [notes, setNotes] = useState('');
  const [outstandingRent, setOutstandingRent] = useState('');
  const [depositReturn, setDepositReturn] = useState('');

  // Load the rider
  const rider = useQuery({
    queryKey: ['rider', riderId],
    queryFn: () => getRider(riderId),
    enabled: Boolean(riderId),
    retry: false,
  });

  // Get the rider's current bike
  const currentBike = useQuery({
    queryKey: ['vehicle', rider.data?.currentVehicleId],
    queryFn: () => getVehicle(rider.data!.currentVehicleId!),
    enabled: Boolean(rider.data?.currentVehicleId),
    retry: false,
  });

  if (currentBike.isLoading || rider.isLoading) {
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
        title="Deboard rider"
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
                Assigned: {rider.data.onboardedOn ? formatDate(rider.data.onboardedOn) : '—'}
              </Typography>
            </Box>
          </Box>
        ) : (
          <Typography sx={{ color: 'text.secondary' }}>This rider has no bike assigned.</Typography>
        )}
      </Panel>

      <Panel label="Condition capture">
        <Box sx={{ mt: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Typography variant="body1">Bike condition on return</Typography>
          <TextField
            select
            label="Condition"
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
            fullWidth
          >
            <MenuItem value="NONE">No damage</MenuItem>
            <MenuItem value="MINOR">Minor</MenuItem>
            <MenuItem value="MAJOR">Major</MenuItem>
            <MenuItem value="ACCIDENT">Accident</MenuItem>
          </TextField>
          <TextField
            label="Notes"
            multiline
            rows={3}
            placeholder="Describe any damage or issues"
            fullWidth
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <TextField
            label="Outstanding rent (paise)"
            type="number"
            fullWidth
            value={outstandingRent}
            onChange={(e) => setOutstandingRent(e.target.value)}
          />
          <TextField
            label="Deposit settlement (₹)"
            type="number"
            fullWidth
            value={depositReturn}
            onChange={(e) => setDepositReturn(e.target.value)}
          />
        </Box>
      </Panel>

      <Panel label="Settlement summary">
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Typography variant="overline">Deboarding summary</Typography>
          <DefinitionList
            columns={2}
            items={[
              { label: 'Rider', value: <Mono>{rider.data?.name || '—'}</Mono> },
              { label: 'Bike', value: <Mono>{rider.data?.currentVehicleId || '—'}</Mono> },
              { label: 'Condition', value: <Mono>{condition}</Mono> },
              { label: 'Outstanding rent', value: <Mono>{outstandingRent ? `₹${outstandingRent}` : '₹0'}</Mono> },
              { label: 'Deposit returned', value: <Mono>{depositReturn ? `₹${depositReturn}` : '₹0'}</Mono> },
            ]}
          />
          <Button variant="contained" sx={{ mt: 2, width: '100%' }} onClick={() => {}}>
            Finalize deboard
          </Button>
        </Box>
      </Panel>
    </Box>
  );
}
