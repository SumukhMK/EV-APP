import { useState } from 'react';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import FormHelperText from '@mui/material/FormHelperText';
import Radio from '@mui/material/Radio';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { SimpleTable } from '../../components/SimpleTable';
import { StateChip } from '../../components/StateChip';
import { FacetChips } from '../../components/FacetChips';
import { SearchField } from '../../components/SearchField';
import { EmptyState } from '../../components/EmptyState';
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

  // Whoever assigns a bike is matching it to where the rider actually rides, so
  // the hub is the filter that matters — a yard spread across four hubs is a
  // scroll otherwise. The id search is for when they already know the bike.
  const [hub, setHub] = useState<string>('ALL');
  const [search, setSearch] = useState('');

  if (vehicles.isLoading) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', py: 8 }}>
        <CircularProgress size={18} />
      </Box>
    );
  }

  const ready = (vehicles.data?.content ?? []).filter((v) => v.id !== excludeId);

  if (ready.length === 0) {
    return (
      <Typography sx={{ fontSize: 14, color: 'text.secondary', py: 4 }}>
        No bikes are ready to deploy. A bike becomes ready once it passes{' '}
        <Box component={Link} to="/qc" sx={{ color: 'inherit' }}>
          QC
        </Box>
        .
      </Typography>
    );
  }

  const hubFacets = (() => {
    const counts = new Map<string, number>();
    ready.forEach((v) => counts.set(v.hub, (counts.get(v.hub) ?? 0) + 1));
    return [
      { value: 'ALL', label: 'All hubs', count: ready.length },
      ...[...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([h, count]) => ({ value: h, label: h, count })),
    ];
  })();

  const q = search.trim().toLowerCase();
  const rows = ready.filter(
    (v) =>
      (hub === 'ALL' || v.hub === hub) &&
      (q === '' || v.id.toLowerCase().includes(q) || v.model.toLowerCase().includes(q)),
  );

  return (
    <>
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column-reverse', md: 'row' },
          alignItems: { xs: 'stretch', md: 'center' },
          justifyContent: 'space-between',
          gap: { xs: 2.5, md: 4 },
          mb: 3.5,
        }}
      >
        <FacetChips options={hubFacets} value={hub} onChange={setHub} />
        <Box sx={{ width: { xs: '100%', md: 'auto' } }}>
          <SearchField value={search} onChange={setSearch} placeholder="Search bike id or model" fullWidth />
        </Box>
      </Box>

      {rows.length === 0 ? (
        <EmptyState
          title="No ready bikes match"
          description="Clear the hub filter or the search to see the rest of the yard."
        />
      ) : (
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
                {v.batteryType}
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
      )}
      {error && <FormHelperText error sx={{ mt: 2 }}>{error}</FormHelperText>}
    </>
  );
}
