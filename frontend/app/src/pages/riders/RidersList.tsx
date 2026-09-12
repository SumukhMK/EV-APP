import { useEffect, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
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
import { listRiders, riderFacets } from '../../lib/api/riders';
import {
  KYC_STATUS_LABEL,
  KYC_STATUS_TONE,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_TONE,
  RIDER_STATUS_LABEL,
  RIDER_STATUS_TONE,
  VEHICLE_STATE_LABEL,
} from '../../lib/labels';
import { rupees } from '../../lib/format';
import { RIDER_STATUSES, VEHICLE_STATES, type Platform, type Rider, type RiderStatus, type VehicleState } from '../../types';
import { accent, neutral } from '../../theme/tokens';
import { useDebounced } from '../../hooks/useDebounced';

const PAGE_SIZE = 12;

/** Anything else in ?status= (a typo, a stale link, a renamed enum) means "all". */
function parseStatus(raw: string | null): RiderStatus | 'ALL' {
  return (RIDER_STATUSES as readonly string[]).includes(raw ?? '') ? (raw as RiderStatus) : 'ALL';
}

function parseVehicleState(raw: string | null): VehicleState | 'ALL' {
  return (VEHICLE_STATES as readonly string[]).includes(raw ?? '') ? (raw as VehicleState) : 'ALL';
}

export function RidersList() {
  const navigate = useNavigate();
  const theme = useTheme();
  // Same two-step shed as the vehicles table. What survives to the narrowest
  // view is what someone chasing a payment actually scans for — who, which
  // bike, whether they have paid and how. Phone and KYC are lookups.
  const narrow = useMediaQuery(theme.breakpoints.down('lg'));
  const compact = useMediaQuery(theme.breakpoints.down('sm'));
  // The filter lives in the URL, not in component state, so a filtered
  // register can be bookmarked, shared, and linked to from the dashboard.
  const [params, setParams] = useSearchParams();
  const status = parseStatus(params.get('status'));
  const platform = (params.get('platform') ?? 'ALL') as Platform | 'ALL';
  const vehicleState = parseVehicleState(params.get('vehicleState'));

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

  const setStatus = (next: RiderStatus | 'ALL') => {
    setParams(
      (prev) => {
        const updated = new URLSearchParams(prev);
        if (next === 'ALL') updated.delete('status');
        else updated.set('status', next);
        return updated;
      },
      { replace: true },
    );
  };

  const setPlatform = (next: Platform | 'ALL') => {
    setParams(
      (prev) => {
        const updated = new URLSearchParams(prev);
        if (next === 'ALL') updated.delete('platform');
        else updated.set('platform', next);
        return updated;
      },
      { replace: true },
    );
  };

  const setVehicleState = (next: VehicleState | 'ALL') => {
    setParams(
      (prev) => {
        const updated = new URLSearchParams(prev);
        if (next === 'ALL') updated.delete('vehicleState');
        else updated.set('vehicleState', next);
        return updated;
      },
      { replace: true },
    );
  };

  // A new filter always starts at the first page — page 4 of the old result
  // set means nothing in the new one. Adjusted during render rather than in an
  // effect, so the list never paints one frame of the wrong page first.
  const filterKey = `${status}|${platform}|${vehicleState}|${q}`;
  const [lastFilterKey, setLastFilterKey] = useState(filterKey);
  if (filterKey !== lastFilterKey) {
    setLastFilterKey(filterKey);
    setPage(0);
  }

  // Facets are counted over the search but not the status filter, so the chips
  // keep showing what else is available instead of collapsing to the selection.
  const facets = useQuery({
    queryKey: ['riders', 'facets', q],
    queryFn: () => riderFacets({ q }),
    placeholderData: keepPreviousData,
  });

  const list = useQuery({
    queryKey: ['riders', 'list', { q, status, platform, vehicleState, page }],
    queryFn: () => listRiders({ q, status, platform, vehicleState, page, size: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  // Every column is flex-weighted, never fixed: the grid then divides the
  // width it actually has instead of overflowing it, so the register never
  // scrolls sideways at any breakpoint. `minWidth` is only a floor to keep a
  // chip or an id legible once the columns get tight.
  const columns = useMemo<GridColDef<Rider>[]>(
    () => [
      {
        field: 'id',
        headerName: 'Rider id',
        flex: 0.7,
        minWidth: 76,
        renderCell: ({ row }) => <Mono sx={{ color: accent[300] }}>{row.id}</Mono>,
      },
      { field: 'name', headerName: 'Name', flex: 1.5, minWidth: 110 },
      {
        field: 'phone',
        headerName: 'Phone',
        flex: 1,
        minWidth: 100,
        renderCell: ({ row }) => (
          <Mono sx={{ fontSize: 12, color: neutral[400] }}>{row.phone}</Mono>
        ),
      },
      {
        field: 'platform',
        headerName: 'Platform',
        flex: 1,
        minWidth: 90,
        cellClassName: 'muted-cell',
      },
      {
        field: 'status',
        headerName: 'Status',
        flex: 0.9,
        minWidth: 82,
        sortable: false,
        renderCell: ({ row }) => (
          <StateChip label={RIDER_STATUS_LABEL[row.status]} tone={RIDER_STATUS_TONE[row.status]} />
        ),
      },
      {
        field: 'kycStatus',
        headerName: 'KYC',
        flex: 0.9,
        minWidth: 82,
        sortable: false,
        renderCell: ({ row }) => (
          <StateChip label={KYC_STATUS_LABEL[row.kycStatus]} tone={KYC_STATUS_TONE[row.kycStatus]} />
        ),
      },
      {
        field: 'planAmount',
        headerName: 'Plan',
        flex: 0.7,
        minWidth: 68,
        align: 'right',
        headerAlign: 'right',
        valueFormatter: (value: number) => rupees(value),
        cellClassName: 'muted-cell',
      },
      {
        field: 'billingDay',
        headerName: 'Billing',
        flex: 0.8,
        minWidth: 82,
        valueFormatter: (value: Rider['billingDay']) =>
          value === 'MONDAY' ? 'Monday' : 'Wednesday',
        cellClassName: 'muted-cell',
      },
      {
        field: 'paymentStatus',
        headerName: 'Payment',
        flex: 0.9,
        minWidth: 82,
        sortable: false,
        renderCell: ({ row }) => (
          <StateChip
            label={PAYMENT_STATUS_LABEL[row.paymentStatus]}
            tone={PAYMENT_STATUS_TONE[row.paymentStatus]}
          />
        ),
      },
      {
        // Sits directly after Payment on purpose: the status answers "have they
        // paid", this answers "how", and a collections call needs both in the
        // same glance. It is the standing arrangement, not last week's receipt.
        field: 'paymentMode',
        headerName: 'Mode',
        flex: 0.9,
        minWidth: 86,
        valueFormatter: (value: Rider['paymentMode']) => PAYMENT_METHOD_LABEL[value],
        cellClassName: 'muted-cell',
      },
      {
        field: 'currentVehicleId',
        headerName: 'Bike',
        flex: 1,
        minWidth: 96,
        renderCell: ({ row }) =>
          row.currentVehicleId ? (
            <Mono sx={{ fontSize: 12 }}>{row.currentVehicleId}</Mono>
          ) : (
            <Box sx={{ color: neutral[600] }}>—</Box>
          ),
      },
    ],
    [],
  );

  const rows = list.data?.content ?? [];
  const total = list.data?.totalElements ?? 0;

  return (
    <>
      <PageHeader
        section="Riders"
        title="Rider register"
        actions={
          <Button component={Link} to="/riders/onboard">
            Onboard rider
          </Button>
        }
      />

      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column-reverse', md: 'row' },
          alignItems: { xs: 'stretch', md: 'center' },
          justifyContent: 'space-between',
          gap: { xs: 3, md: 5 },
          mt: 4,
        }}
      >
        <FacetChips
          options={facets.data ?? [{ value: 'ALL' as const, label: 'All', count: 0 }]}
          value={status}
          onChange={setStatus}
        />
        <Box sx={{ width: { xs: '100%', md: 'auto' }, flex: { md: '0 0 auto' } }}>
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Search id, name, phone, bike"
            fullWidth
          />
        </Box>
      </Box>

      {/*
        Secondary refinements sit as a compact pair under the primary row. The
        field name is a tracked-out caption above each control, not MUI's
        floating notch label — on the dark ground the notch reads like a
        validation error, and a caption matches how the rest of the app labels
        things (the section eyebrow, the panel titles, the nav footer).
      */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          gap: 2.5,
          mt: 3,
        }}
      >
        <Box sx={{ width: { xs: '100%', sm: 220 } }}>
          <Typography variant="overline" sx={{ mb: 0.75 }}>
            Platform
          </Typography>
          <TextField
            select
            size="small"
            value={platform}
            onChange={(e) => setPlatform(e.target.value as Platform | 'ALL')}
          >
            <MenuItem value="ALL">All platforms</MenuItem>
            {['Zomato', 'Swiggy', 'Swiggy Instamart', 'Zepto', 'Blinkit', 'Flipkart Minutes', 'Porter', 'Dunzo', 'Ownly', 'EatSure', 'BigBasket', 'Borzo', 'Other'].map((p) => (
              <MenuItem key={p} value={p}>{p}</MenuItem>
            ))}
          </TextField>
        </Box>
        <Box sx={{ width: { xs: '100%', sm: 220 } }}>
          <Typography variant="overline" sx={{ mb: 0.75 }}>
            Vehicle status
          </Typography>
          <TextField
            select
            size="small"
            value={vehicleState}
            onChange={(e) => setVehicleState(e.target.value as VehicleState | 'ALL')}
          >
            <MenuItem value="ALL">All vehicle statuses</MenuItem>
            {VEHICLE_STATES.map((s) => (
              <MenuItem key={s} value={s}>{VEHICLE_STATE_LABEL[s]}</MenuItem>
            ))}
          </TextField>
        </Box>
      </Box>

      <Box sx={{ mt: 3.5, '& .muted-cell': { color: neutral[400] } }}>
        <DataTable<Rider>
          rows={rows}
          columns={columns}
          loading={list.isLoading}
          columnVisibilityModel={{
            phone: !narrow,
            platform: !narrow,
            kycStatus: !narrow,
            billingDay: !narrow,
            planAmount: !compact,
            // Kept through the tablet shed, unlike platform and billing day: it
            // is half of what a collections call needs, and the other half
            // (payment status) is right beside it.
            paymentMode: !compact,
          }}
          onRowClick={({ row }) => navigate(`/riders/${row.id}`)}
          hideFooter
          emptyMessage="No riders match this filter"
          sx={{ '& .MuiDataGrid-row': { cursor: 'pointer' } }}
        />
      </Box>

      <TableFooter
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onPageChange={setPage}
        noun="riders"
      />
    </>
  );
}
