import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import PaymentsIcon from '@mui/icons-material/PaymentsOutlined';
import PriceCheckIcon from '@mui/icons-material/PriceCheckOutlined';
import PendingIcon from '@mui/icons-material/PendingActionsOutlined';
import WarningIcon from '@mui/icons-material/ErrorOutlineOutlined';
import DoneAllIcon from '@mui/icons-material/DoneAllOutlined';
import CheckIcon from '@mui/icons-material/Check';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { StatTiles } from '../../components/StatTiles';
import { StateChip } from '../../components/StateChip';
import { EmptyState } from '../../components/EmptyState';
import { Mono } from '../../components/Mono';
import { SimpleTable, type Column } from '../../components/SimpleTable';
import { TableFooter } from '../../components/TableFooter';
import { SearchField } from '../../components/SearchField';
import { FacetChips } from '../../components/FacetChips';
import { getCollections } from '../../lib/api/payments';
import { DUNNING_LABEL, DUNNING_TONE, PAYMENT_METHOD_LABEL } from '../../lib/labels';
import { formatDate, rupeesWithSymbol } from '../../lib/format';
import { neutral, status as tones } from '../../theme/tokens';
import { useSession } from '../../app/sessionContext';
import { canCollectPayments } from '../../lib/roles';
import type { CollectionRow } from '../../types';
import { CollectDialog, type CollectTarget } from './CollectDialog';
import { owesTag, owesText, owesTone, whenText } from './money';

type Filter = 'all' | 'late' | 'owes' | 'paid';
const PAGE_SIZE = 25;

const isLate = (r: CollectionRow) => r.owes > 0 && r.daysLate > 0;
const MATCH: Record<Filter, (r: CollectionRow) => boolean> = {
  all: () => true,
  late: isLate,
  owes: (r) => r.owes > 0 && r.daysLate === 0,
  paid: (r) => r.owes <= 0,
};

/**
 * Collections: every rider with a bike, and anyone without one who still
 * owes — one number each. Replaces the weekly run and the overdue list.
 *
 * Late riders come first, the longest-late at the top. The Late filter adds
 * the phone and the next step. Search finds a rider by name, code, phone or
 * bike in a few keystrokes, so nobody pages through the list at the counter.
 */
export function Collections() {
  const navigate = useNavigate();
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const { user } = useSession();
  const canCollect = canCollectPayments(user.roleKey);

  const [params, setParams] = useSearchParams();
  const filter = (['all', 'late', 'owes', 'paid'].includes(params.get('filter') ?? '') ? params.get('filter') : 'all') as Filter;
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [collect, setCollect] = useState<CollectTarget | null>(null);
  const [reminded, setReminded] = useState<Set<string>>(new Set());

  const data = useQuery({ queryKey: ['payments', 'collections'], queryFn: getCollections, placeholderData: keepPreviousData });
  const all = useMemo(() => data.data?.rows ?? [], [data.data]);

  const counts = useMemo(
    () => ({
      all: all.length,
      late: all.filter(MATCH.late).length,
      owes: all.filter(MATCH.owes).length,
      paid: all.filter(MATCH.paid).length,
    }),
    [all],
  );
  const totalOwed = all.reduce((t, r) => t + Math.max(0, r.owes), 0);
  const lateValue = all.filter(isLate).reduce((t, r) => t + r.owes, 0);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/\s+/g, '');
    return all.filter(MATCH[filter]).filter((r) =>
      !q ||
      r.riderName.toLowerCase().replace(/\s+/g, '').includes(q) ||
      r.riderId.toLowerCase().includes(q) ||
      r.phone.replace(/\D/g, '').includes(q.replace(/\D/g, '') || '\u0000') ||
      (r.vehicleId ?? '').toLowerCase().includes(q),
    );
  }, [all, filter, query]);
  const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const setFilter = (next: Filter) => {
    setPage(0);
    setParams(next === 'all' ? {} : { filter: next }, { replace: true });
  };
  const openCollect = (r: CollectionRow) =>
    setCollect({
      riderId: r.riderId,
      riderName: r.riderName,
      vehicleId: r.vehicleId,
      owes: r.owes,
      daysLate: r.daysLate,
      usualMethod: r.usualMethod,
      lastPayment: r.lastPayment,
    });
  const remind = (r: CollectionRow) => setReminded((s) => new Set(s).add(r.riderId));
  const account = (r: CollectionRow) => navigate(`/payments/riders/${r.riderId}`);

  const owesCell = (r: CollectionRow) => (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: phone ? 'flex-start' : 'flex-end', gap: 0.5 }}>
      <Mono sx={{ fontSize: 15, color: r.owes <= 0 ? tones.good.fg : isLate(r) ? tones.bad.fg : undefined }}>
        {owesText(r.owes)}
      </Mono>
      <StateChip label={owesTag(r.owes, r.daysLate, r.dueBy)} tone={owesTone(r.owes, r.daysLate)} />
    </Box>
  );
  const lastPaidCell = (r: CollectionRow) =>
    r.lastPayment ? (
      <Box sx={{ minWidth: 0 }}>
        <Mono sx={{ fontSize: 13 }}>
          {rupeesWithSymbol(r.lastPayment.amount)} · {PAYMENT_METHOD_LABEL[r.lastPayment.method]}
        </Mono>
        <Typography sx={{ fontSize: 12, color: neutral[500] }}>
          {whenText(r.lastPayment.at)}
          {r.lastPayment.by ? ` · ${r.lastPayment.by}` : ''}
        </Typography>
      </Box>
    ) : (
      <Typography sx={{ fontSize: 12, color: neutral[600] }}>No payment yet</Typography>
    );
  const actions = (r: CollectionRow, full = false) => (
    <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'flex-end', flexWrap: 'wrap', width: full ? '100%' : undefined }}>
      {filter === 'late' && (
        reminded.has(r.riderId) ? (
          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color: tones.good.fg, fontSize: 13, minHeight: 36 }}>
            <CheckIcon sx={{ fontSize: 16 }} /> Reminded
          </Box>
        ) : (
          <Button
            color="inherit"
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              remind(r);
            }}
            sx={{ minHeight: 36, flex: full ? 1 : 'none' }}
          >
            Mark reminded
          </Button>
        )
      )}
      {canCollect && (
        <Button
          variant={r.owes > 0 ? 'contained' : 'outlined'}
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            openCollect(r);
          }}
          sx={{ minHeight: 36, minWidth: 88, flex: full ? 1 : 'none' }}
        >
          Collect
        </Button>
      )}
    </Box>
  );

  const columns: Column<CollectionRow>[] = [
    {
      key: 'rider',
      header: 'Rider',
      render: (r) => (
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {r.riderName}
          </Typography>
          <Mono sx={{ fontSize: 12, color: neutral[500] }}>
            {r.riderId}
            {!r.active ? ' · bike returned' : ''}
          </Mono>
        </Box>
      ),
    },
    { key: 'bike', header: 'Bike', width: 120, render: (r) => <Mono sx={{ fontSize: 12.5, color: neutral[400] }}>{r.vehicleId ?? '—'}</Mono> },
    ...(filter === 'late'
      ? [
          {
            key: 'phone',
            header: 'Phone',
            width: 130,
            render: (r: CollectionRow) => (
              <Link href={`tel:${r.phone}`} onClick={(e) => e.stopPropagation()} sx={{ fontFamily: 'inherit' }}>
                <Mono sx={{ fontSize: 12.5 }}>{r.phone}</Mono>
              </Link>
            ),
          } satisfies Column<CollectionRow>,
        ]
      : []),
    { key: 'owes', header: 'Owes', align: 'right', width: 150, render: owesCell },
    ...(filter === 'late'
      ? [
          {
            key: 'next',
            header: 'What happens next',
            width: 170,
            render: (r: CollectionRow) =>
              r.stage ? <StateChip label={DUNNING_LABEL[r.stage]} tone={DUNNING_TONE[r.stage]} /> : null,
          } satisfies Column<CollectionRow>,
        ]
      : [{ key: 'last', header: 'Last paid', width: 190, render: lastPaidCell } satisfies Column<CollectionRow>]),
    { key: 'action', header: '', align: 'right', width: filter === 'late' ? 230 : 110, render: (r) => actions(r) },
  ];

  return (
    <>
      <PageHeader
        section="Money"
        title="Collections"
        icon={PaymentsIcon}
        meta={data.data ? <Mono sx={{ fontSize: 12, color: neutral[500] }}>{formatDate(data.data.today)}</Mono> : undefined}
        actions={
          <Button component={RouterLink} to="/payments/today" color="inherit" size="small">
            Today's collections
          </Button>
        }
      />

      <Box sx={{ mt: 4.5 }}>
        <StatTiles
          tiles={[
            {
              label: 'Collected today',
              value: data.data ? rupeesWithSymbol(data.data.collectedToday) : '—',
              tone: 'good',
              icon: PriceCheckIcon,
              to: '/payments/today',
            },
            { label: 'Total owed', value: data.data ? rupeesWithSymbol(totalOwed) : '—', icon: PendingIcon, to: '/payments/collections?filter=owes' },
            {
              label: 'Late',
              value: data.data ? `${counts.late} · ${rupeesWithSymbol(lateValue)}` : '—',
              tone: counts.late > 0 ? 'bad' : 'good',
              icon: WarningIcon,
              to: '/payments/collections?filter=late',
            },
            { label: 'Paid up', value: data.data ? `${counts.paid}/${counts.all}` : '—', icon: DoneAllIcon, to: '/payments/collections?filter=paid' },
          ]}
        />
      </Box>

      <Panel sx={{ mt: 5, p: { xs: '14px 12px 12px', sm: '18px 20px 14px' } }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'center', mb: 3 }}>
          <SearchField
            value={query}
            onChange={(next) => {
              setQuery(next);
              setPage(0);
            }}
            placeholder="Search name, R-code, phone or bike"
            fullWidth
            width={360}
          />
          <FacetChips<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All', count: counts.all },
              { value: 'late', label: 'Late', count: counts.late },
              { value: 'owes', label: 'Owes', count: counts.owes },
              { value: 'paid', label: 'Paid up', count: counts.paid },
            ]}
          />
        </Box>

        {data.isLoading ? (
          <EmptyState title="Loading riders…" />
        ) : data.isError ? (
          <EmptyState title="Could not load collections" description={(data.error as Error).message} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={query ? `No rider matches "${query}"` : filter === 'late' ? 'Nobody is late' : 'Nobody here'}
            description={query ? 'Try a name, an R-code, a phone number or a bike number.' : undefined}
          />
        ) : phone ? (
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            {pageRows.map((r) => (
              <Box
                key={r.riderId}
                sx={{ py: 3, borderBottom: `1px solid ${neutral[900]}`, '&:last-of-type': { border: 0 } }}
              >
                <Box
                  component={RouterLink}
                  to={`/payments/riders/${r.riderId}`}
                  sx={{ display: 'flex', justifyContent: 'space-between', gap: 3, color: 'inherit', textDecoration: 'none' }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: 15, fontWeight: 500 }}>{r.riderName}</Typography>
                    <Mono sx={{ fontSize: 12, color: neutral[500] }}>
                      {r.riderId} · {r.vehicleId ?? 'bike returned'}
                    </Mono>
                  </Box>
                  {owesCell(r)}
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mt: 2 }}>
                  {filter === 'late' ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                      <Link href={`tel:${r.phone}`}><Mono sx={{ fontSize: 13 }}>{r.phone}</Mono></Link>
                      {r.stage && <StateChip label={DUNNING_LABEL[r.stage]} tone={DUNNING_TONE[r.stage]} />}
                    </Box>
                  ) : (
                    lastPaidCell(r)
                  )}
                </Box>
                <Box sx={{ mt: 2 }}>{actions(r, true)}</Box>
              </Box>
            ))}
          </Box>
        ) : (
          <SimpleTable
            rows={pageRows}
            getRowKey={(r) => r.riderId}
            rowSx={() => ({ cursor: 'pointer', '&:hover td': { background: neutral[900] } })}
            onRowClick={account}
            scrollable
            columns={columns}
          />
        )}

        {rows.length > PAGE_SIZE && (
          <TableFooter page={page} pageSize={PAGE_SIZE} total={rows.length} onPageChange={setPage} noun="riders" />
        )}
      </Panel>

      <Typography sx={{ fontSize: 12, color: neutral[500], mt: 3 }}>
        Owes is rent + repairs − payments, worked out once for every screen. A payment covers the oldest unpaid
        week first. Mark reminded is a note for the team; no message is sent.
      </Typography>

      <CollectDialog target={collect} onClose={() => setCollect(null)} />
    </>
  );
}
