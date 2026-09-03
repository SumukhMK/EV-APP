import { useEffect, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { GridColDef } from '@mui/x-data-grid';
import { PageHeader } from '../../components/PageHeader';
import { FacetChips } from '../../components/FacetChips';
import { SearchField } from '../../components/SearchField';
import { DataTable } from '../../components/DataTable';
import { StateChip } from '../../components/StateChip';
import { Mono } from '../../components/Mono';
import { TableFooter } from '../../components/TableFooter';
import { listVehicles, vehicleFacets } from '../../lib/api/vehicles';
import { VEHICLE_STATE_LABEL, VEHICLE_STATE_TONE } from '../../lib/labels';
import { VEHICLE_STATES, type Vehicle, type VehicleState } from '../../types';
import { accent, neutral } from '../../theme/tokens';
import { useDebounced } from '../../hooks/useDebounced';

const PAGE_SIZE = 12;

/** Anything else in ?state= (a typo, a stale link, a renamed enum) means "all". */
function parseState(raw: string | null): VehicleState | 'ALL' {
  return (VEHICLE_STATES as readonly string[]).includes(raw ?? '') ? (raw as VehicleState) : 'ALL';
}

export function VehiclesList() {
  const navigate = useNavigate();
  const theme = useTheme();
  // The table sheds columns in two steps rather than scrolling sideways.
  // What survives to the narrowest view is what a dispatcher actually scans
  // for — which bike, what state, who has it. The reference numbers (chassis,
  // battery, hub) are lookups, and they live on the detail page anyway.
  const narrow = useMediaQuery(theme.breakpoints.down('lg'));
  const compact = useMediaQuery(theme.breakpoints.down('sm'));
  // The filter lives in the URL, not in component state. That is what lets the
  // dashboard tiles link straight to a filtered list, and it means a filtered
  // view can be bookmarked, shared, and stepped back out of with the browser's
  // own back button.
  const [params, setParams] = useSearchParams();
  const state = parseState(params.get('state'));

  // The search box keeps its own state so typing stays instant; only the
  // settled value is written back to the URL.
  const [search, setSearch] = useState(() => params.get('q') ?? '');
  const [page, setPage] = useState(0);
  const q = useDebounced(search, 250);

  useEffect(() => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (q) next.set('q', q);
        else next.delete('q');
        return next;
      },
      // Replace, so a back press leaves the list rather than replaying every
      // keystroke the user typed into it.
      { replace: true },
    );
  }, [q, setParams]);

  const setState = (next: VehicleState | 'ALL') => {
    setParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next === 'ALL') params.delete('state');
        else params.set('state', next);
        return params;
      },
      { replace: true },
    );
  };

  // A new filter always starts at the first page — page 4 of the old result
  // set means nothing in the new one. Adjusted during render rather than in an
  // effect, so the list never paints one frame of the wrong page first.
  const filterKey = `${state}|${q}`;
  const [lastFilterKey, setLastFilterKey] = useState(filterKey);
  if (filterKey !== lastFilterKey) {
    setLastFilterKey(filterKey);
    setPage(0);
  }

  // Facets are counted over the search but not the state filter, so the chips
  // keep showing what else is available instead of collapsing to the selection.
  const facets = useQuery({
    queryKey: ['vehicles', 'facets', q],
    queryFn: () => vehicleFacets({ q }),
    placeholderData: keepPreviousData,
  });

  const list = useQuery({
    queryKey: ['vehicles', 'list', { q, state, page }],
    queryFn: () => listVehicles({ q, state, page, size: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  const columns = useMemo<GridColDef<Vehicle>[]>(
    () => [
      {
        field: 'id',
        headerName: 'Vehicle id',
        width: compact ? 108 : 130,
        renderCell: ({ row }) => <Mono sx={{ color: accent[300] }}>{row.id}</Mono>,
      },
      {
        field: 'chassisNumber',
        headerName: 'Chassis',
        width: 190,
        renderCell: ({ row }) => (
          <Mono sx={{ fontSize: 12, color: neutral[400] }}>{row.chassisNumber}</Mono>
        ),
      },
      { field: 'model', headerName: 'Model', flex: 1, minWidth: 140 },
      {
        field: 'batteryType',
        headerName: 'Battery',
        width: 130,
        valueFormatter: (value) => (value === 'SWAPPABLE' ? 'Sun Mobility' : 'Fixed pack'),
        cellClassName: 'muted-cell',
      },
      { field: 'hub', headerName: 'Hub', width: 130, cellClassName: 'muted-cell' },
      {
        field: 'state',
        headerName: 'State',
        width: compact ? 124 : 140,
        sortable: false,
        renderCell: ({ row }) => (
          <StateChip label={VEHICLE_STATE_LABEL[row.state]} tone={VEHICLE_STATE_TONE[row.state]} />
        ),
      },
      {
        field: 'currentRiderName',
        headerName: compact ? 'Rider' : 'Current rider',
        width: compact ? 0 : 170,
        flex: compact ? 1 : undefined,
        minWidth: compact ? 120 : undefined,
        renderCell: ({ row }) => row.currentRiderName ?? <Box sx={{ color: neutral[600] }}>—</Box>,
      },
    ],
    [compact],
  );

  const rows = list.data?.content ?? [];
  const total = list.data?.totalElements ?? 0;

  return (
    <>
      <PageHeader
        section="Fleet"
        title="Vehicles"
        actions={
          <>
            <Button color="inherit" component={Link} to="/vehicles/bulk-upload">
              Bulk upload
            </Button>
            <Button component={Link} to="/vehicles/new">
              Add vehicle
            </Button>
          </>
        }
      />

      <Box
        sx={{
          display: 'flex',
          // Search drops under the chips below md, and takes the full width
          // there rather than sitting as a stub at one end.
          flexDirection: { xs: 'column-reverse', md: 'row' },
          alignItems: { xs: 'stretch', md: 'center' },
          justifyContent: 'space-between',
          gap: { xs: 3, md: 5 },
          mt: 4,
        }}
      >
        <FacetChips
          options={facets.data ?? [{ value: 'ALL' as const, label: 'All', count: 0 }]}
          value={state}
          onChange={setState}
        />
        <Box sx={{ width: { xs: '100%', md: 'auto' }, flex: { md: '0 0 auto' } }}>
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Search id, chassis, rider"
            fullWidth
          />
        </Box>
      </Box>

      <Box sx={{ mt: 3.5, '& .muted-cell': { color: neutral[400] } }}>
        <DataTable<Vehicle>
          rows={rows}
          columns={columns}
          loading={list.isLoading}
          columnVisibilityModel={{
            chassisNumber: !narrow,
            batteryType: !narrow,
            hub: !narrow,
            model: !compact,
          }}
          onRowClick={({ row }) => navigate(`/vehicles/${row.id}`)}
          hideFooter
          emptyMessage="No vehicles match this filter"
          sx={{ '& .MuiDataGrid-row': { cursor: 'pointer' } }}
        />
      </Box>

      <TableFooter
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onPageChange={setPage}
        noun="vehicles"
      />
    </>
  );
}
