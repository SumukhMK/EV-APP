import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import FormHelperText from '@mui/material/FormHelperText';
import Radio from '@mui/material/Radio';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { SimpleTable } from '../../components/SimpleTable';
import { StateChip } from '../../components/StateChip';
import { Mono } from '../../components/Mono';
import { listVehicles } from '../../lib/api/vehicles';
import { VEHICLE_STATE_LABEL, VEHICLE_STATE_TONE } from '../../lib/labels';
import { neutral } from '../../theme/tokens';

/**
 * The bikes an assignment or an exchange can pick from, and the pick itself.
 *
 * It is a table rather than a dropdown because the choice is not arbitrary —
 * whoever assigns a bike is comparing hub and model against where the rider
 * actually rides, and a dropdown hides exactly the columns they need. The
 * query is fixed to READY_TO_DEPLOY: the one rule the registry has always had
 * is that nothing else can leave the yard, so the screen cannot offer a bike
 * the server would refuse.
 */
export function VehiclePicker({
  value,
  onChange,
  error,
  excludeId,
}: {
  value: string;
  onChange: (vehicleId: string) => void;
  error?: string;
  /** The bike being handed back, on an exchange. */
  excludeId?: string;
}) {
  const vehicles = useQuery({
    queryKey: ['vehicles', 'ready-to-deploy'],
    // A yard rarely holds more than a couple of dozen ready bikes; asking for
    // 50 keeps the whole choice on one screen instead of paginating a picker.
    queryFn: () => listVehicles({ state: 'READY_TO_DEPLOY', size: 50 }),
  });

  if (vehicles.isLoading) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', py: 8 }}>
        <CircularProgress size={18} />
      </Box>
    );
  }

  const rows = (vehicles.data?.content ?? []).filter((v) => v.id !== excludeId);

  if (rows.length === 0) {
    return (
      <Typography sx={{ fontSize: 14, color: 'text.secondary', py: 4 }}>
        No bikes are ready to deploy. Bikes reach that state by passing{' '}
        <Box component={Link} to="/qc" sx={{ color: 'inherit' }}>
          QC
        </Box>
        .
      </Typography>
    );
  }

  return (
    <>
      <SimpleTable
        rows={rows}
        getRowKey={(v) => v.id}
        rowSx={(v) => (v.id === value ? { background: neutral[900] } : undefined)}
        columns={[
          {
            key: 'pick',
            header: '',
            width: 54,
            render: (v) => (
              <Radio
                size="small"
                checked={v.id === value}
                onChange={() => onChange(v.id)}
                slotProps={{ input: { 'aria-label': `Select ${v.id}` } }}
              />
            ),
          },
          { key: 'id', header: 'Bike id', width: 130, render: (v) => <Mono>{v.id}</Mono> },
          { key: 'model', header: 'Model', width: 170, render: (v) => v.model },
          {
            key: 'battery',
            header: 'Battery',
            width: 140,
            render: (v) => (
              <Box component="span" sx={{ color: neutral[400] }}>
                {v.batteryType === 'SWAPPABLE' ? 'Sun Mobility' : 'Fixed pack'}
              </Box>
            ),
          },
          {
            key: 'hub',
            header: 'Hub',
            width: 140,
            render: (v) => <Box component="span" sx={{ color: neutral[400] }}>{v.hub}</Box>,
          },
          {
            key: 'state',
            header: 'State',
            width: 150,
            render: (v) => (
              <StateChip label={VEHICLE_STATE_LABEL[v.state]} tone={VEHICLE_STATE_TONE[v.state]} />
            ),
          },
        ]}
      />
      {error && <FormHelperText error sx={{ mt: 2 }}>{error}</FormHelperText>}
    </>
  );
}
