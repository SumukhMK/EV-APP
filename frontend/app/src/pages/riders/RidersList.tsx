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
import { listRiders, riderFacets } from '../../lib/api/riders';
import { RIDER_STATUS_LABEL, RIDER_STATUS_TONE, KYC_STATUS_LABEL, KYC_STATUS_TONE, PAYMENT_STATUS_LABEL, PAYMENT_STATUS_TONE } from '../../lib/labels';
import { formatDate, rupees } from '../../lib/format';
import { neutral, accent } from '../../theme/tokens';
import { useDebounced } from '../../hooks/useDebounced';

const PAGE_SIZE = 12;

export function RidersList() {
  const navigate = useNavigate();
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down('sm'));
  const [params, setParams] = useSearchParams();
  const state = params.get('state') ?? 'ACTIVE';
  const q = useDebounced(params.get('q') ?? '', 250);

  useEffect(() => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (q) next.set('q', q);
        else next.delete('q');
        return next;
      },
      { replace: true },
    );
  }, [q, setParams]);

  const setState = (next: string) => {
    setParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.set('state', next);
        return params;
      },
      { replace: true },
    );
  };

  const filterKey = `${state}|${q}`;
  const [lastFilterKey, setLastFilterKey] = useState(filterKey);
  if (filterKey !== lastFilterKey) {
    setLastFilterKey(filterKey);
    setPage(0);
  }

  const facets = useQuery({
    queryKey: ['riders', 'facets', q, state],
    queryFn: () => riderFacets({ q, status: state }),
    placeholderData: keepPreviousData,
  });

  const list = useQuery({
    queryKey: ['riders', 'list', { q, state, page: 0 }],
    queryFn: () => listRiders({ q, state, page: 0, size: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  const columns = useMemo<GridColDef<Rider>[]>(
    () => [
      {
        field: 'id',
        headerName: 'Rider id',
        width: compact ? 100 : 120,
        renderCell: ({ row }) => <Mono sx={{ color: accent[300] }}>{row.id}</Mono>,
      },
      {
        field: 'name',
        headerName: 'Name',
        width: compact ? 140 : 180,
      },
      {
        field: 'phone',
        headerName: 'Phone',
        width: compact ? 120 : 150,
        renderCell: ({ row }) => (
          <Mono sx={{ fontSize: 12, color: neutral[400] }}>{row.phone}</Mono>
        ),
      },
      {
        field: 'status',
        headerName: 'Status',
        width: compact ? 100 : 120,
        sortable: false,
        renderCell: ({ row }) => (
          <StateChip label={RIDER_STATUS_LABEL[row.status]} tone={RIDER_STATUS_TONE[row.status]} />
        ),
      },
      {
        field: 'kycStatus',
        headerName: 'KYC',
        width: compact ? 80 : 100,
        sortable: false,
        renderCell: ({ row }) => (
          <StateChip label={KYC_STATUS_LABEL[row.kycStatus]} tone={KYC_STATUS_TONE[row.kycStatus]} />
        ),
      },
      {
        field: 'planAmount',
        headerName: 'Plan (₹)',
        width: compact ? 80 : 100,
        align: 'right',
        valueFormatter: (value) => rupees(value),
        cellClassName: 'muted-cell',
      },
      {
        field: 'billingDay',
        headerName: 'Billing',
        width: compact ? 70 : 90,
        renderCell: ({ row }) => (row.billingDay === 'MONDAY' ? 'Monday' : 'Wednesday'),
      },
      {
        field: 'paymentStatus',
        headerName: 'Payment',
        width: compact ? 80 : 100,
        sortable: false,
        renderCell: ({ row }) => (
          <StateChip label={PAYMENT_STATUS_LABEL[row.paymentStatus]} tone={PAYMENT_STATUS_TONE[row.paymentStatus]} />
        ),
      },
      {
        field: 'currentVehicleId',
        headerName: 'Bike',
        width: compact ? 0 : 130,
        flex: compact ? 1 : undefined,
        minWidth: compact ? 100 : undefined,
        renderCell: ({ row }) => row.currentVehicleId ?? <Box sx={{ color: neutral[600] }}>—</Box>,
      },
    ],
    [compact],
  );

  const rows = list.data?.content ?? [];
  const total = list.data?.totalElements ?? 0;

  return (
    <>
      <PageHeader
        section="Riders"
        title="Rider register"
        actions={
          <>
            <Button color="inherit" component={Link} to="/riders/onboard">
              Onboard rider
            </Button>
          </>
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
          options={facets.data ?? [{ value: 'ACTIVE' as const, label: 'Active', count: 0 }]}
          value={state as any}
          onChange={setState}
        />
        <Box sx={{ width: { xs: '100%', md: 'auto' }, flex: { md: '0 0 auto' } }}>
          <SearchField
            value={q}
            onChange={(e) => setParams((prev) => { const next = new URLSearchParams(prev); next.set('q', e.target.value); return next; })}
            placeholder="Search id, name, phone"
            fullWidth
          />
        </Box>
      </Box>

      <Box sx={{ mt: 3.5, '& .muted-cell': { color: neutral[400] } }}>
        <DataTable<Rider>
          rows={rows}
          columns={columns}
          loading={list.isLoading}
          emptyMessage="No riders match this filter"
          sx={{ '& .MuiDataGrid-row': { cursor: 'pointer' } }}
        />
      </Box>

      <TableFooter
        page={0}
        pageSize={PAGE_SIZE}
        total={total}
        onPageChange={() => {}}
        noun="riders"
      />
    </>
  );
}

export type Rider = {
  id: string;
  name: string;
  phone: string;
  status: 'ACTIVE' | 'INACTIVE' | 'BLACKLISTED';
  kycStatus: 'PENDING' | 'VERIFIED' | 'REJECTED';
  planAmount: number;
  billingDay: 'MONDAY' | 'WEDNESDAY';
  paymentStatus: 'PAID' | 'PARTIAL' | 'OVERDUE' | 'PENDING';
  currentVehicleId: string | null;
};