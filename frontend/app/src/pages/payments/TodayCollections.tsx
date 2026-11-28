import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import TodayIcon from '@mui/icons-material/EventAvailableOutlined';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { StatTiles } from '../../components/StatTiles';
import { EmptyState } from '../../components/EmptyState';
import { Mono } from '../../components/Mono';
import { SimpleTable } from '../../components/SimpleTable';
import { DateRangeFields } from '../../components/form/DateRangeFields';
import { getPaymentsReceived } from '../../lib/api/payments';
import { isoDay, presets, rangeError, thisWeek } from '../../lib/dateRange';
import { PAYMENT_METHOD_LABEL } from '../../lib/labels';
import { rupeesWithSymbol } from '../../lib/format';
import { neutral, status as tones } from '../../theme/tokens';
import { dayRange, money } from './money';
import type { Payment } from '../../types';

const clock = new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
const dayAndClock = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });

/**
 * Payments received over any range of days — this week unless a range is
 * picked. The totals by person are the cash count: cash is what each person
 * should be holding; UPI and bank went straight to the account. A reversal
 * comes off the totals of whoever took the original payment.
 *
 * The range lives in the address (?from=&to=), so a link or a refresh keeps
 * it. Nothing is fetched while the range is incomplete or backwards.
 */
export function TodayCollections() {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const today = isoDay(new Date());
  const week = thisWeek(today);
  const [params, setParams] = useSearchParams();

  const custom = params.has('from') || params.has('to');
  const from = custom ? params.get('from') ?? '' : week.from;
  const to = custom ? params.get('to') ?? '' : week.to;
  const error = rangeError(from, to);
  const isDefault = from === week.from && to === week.to;
  const oneDay = from === to;

  const setRange = (next: { from: string; to: string }) =>
    setParams(
      next.from === week.from && next.to === week.to ? {} : { from: next.from, to: next.to },
      { replace: true },
    );

  const received = useQuery({
    queryKey: ['payments', 'received', from, to],
    queryFn: () => getPaymentsReceived(from, to),
    enabled: !error,
    placeholderData: keepPreviousData,
  });
  const d = error ? undefined : received.data;
  const cash = d?.byStaff.reduce((t, s) => t + s.cash, 0) ?? 0;
  const upi = d?.byStaff.reduce((t, s) => t + s.upi, 0) ?? 0;
  const bank = d?.byStaff.reduce((t, s) => t + s.bank, 0) ?? 0;
  const reversals = d?.payments.filter((p) => p.reversesId).length ?? 0;

  const when = (p: Payment) => (oneDay ? clock : dayAndClock).format(new Date(p.at));
  const change = (p: Payment) =>
    p.owedBefore == null || p.owedAfter == null ? '—' : `${money(p.owedBefore)} → ${money(p.owedAfter)}`;
  const span = error ? '' : oneDay ? dayRange(from, null) : dayRange(from, to);
  const empty = error ? error : `No payments ${oneDay ? `on ${span}` : `between ${span}`}`;

  return (
    <>
      <PageHeader
        section="Money"
        title="Payments received"
        icon={TodayIcon}
        backTo="/payments/collections"
        backLabel="Collections"
        meta={span ? <Mono sx={{ fontSize: 12, color: neutral[500] }}>{isDefault ? `This week · ${span}` : span}</Mono> : undefined}
      />

      <Panel label="Dates" sx={{ mt: 4.5, p: { xs: '14px 12px 12px', sm: '18px 20px 16px' } }}>
        <Box sx={{ maxWidth: 560 }}>
          <DateRangeFields from={from} to={to} max={today} error={from && to ? error : null} onChange={setRange} />
        </Box>
        {!from || !to ? (
          <Typography sx={{ mt: 1.5, fontSize: 13, color: neutral[400] }}>Pick both a start date and an end date.</Typography>
        ) : null}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 3, alignItems: 'center' }}>
          {presets(today).map((p) => {
            const on = p.range.from === from && p.range.to === to;
            return (
              <Chip
                key={p.key}
                label={p.label}
                clickable
                color={on ? 'primary' : 'default'}
                variant={on ? 'filled' : 'outlined'}
                onClick={() => setRange(p.range)}
                sx={{ minHeight: 32 }}
              />
            );
          })}
          {!isDefault && (
            <Button color="inherit" size="small" onClick={() => setRange(week)} sx={{ minHeight: 32, ml: { sm: 1 } }}>
              Reset to this week
            </Button>
          )}
        </Box>
      </Panel>

      <Box sx={{ mt: 5 }}>
        <StatTiles
          tiles={[
            { label: 'Collected', value: d ? rupeesWithSymbol(d.total) : '—', tone: 'good' },
            { label: 'Cash to hand over', value: d ? rupeesWithSymbol(cash) : '—', tone: cash > 0 ? 'caution' : undefined },
            { label: 'UPI', value: d ? rupeesWithSymbol(upi) : '—' },
            { label: 'Bank', value: d ? rupeesWithSymbol(bank) : '—' },
          ]}
        />
      </Box>

      <Panel
        label="By staff"
        subtitle="Count the cash each person holds against this. UPI and bank go straight to the account."
        sx={{ mt: 5, p: { xs: '14px 12px 12px', sm: '18px 20px 14px' } }}
      >
        {error ? (
          <EmptyState title={error} />
        ) : !d ? (
          <EmptyState title="Loading…" />
        ) : d.byStaff.length === 0 ? (
          <EmptyState title={empty} />
        ) : (
          <SimpleTable
            rows={d.byStaff}
            getRowKey={(s) => s.name}
            scrollable={phone}
            columns={[
              { key: 'name', header: 'Taken by', render: (s) => <Typography sx={{ fontSize: 14 }}>{s.name}</Typography> },
              { key: 'count', header: 'Payments', align: 'right', width: 90, render: (s) => <Mono>{s.count}</Mono> },
              { key: 'cash', header: 'Cash', align: 'right', width: 110, render: (s) => <Mono sx={{ color: s.cash ? tones.caution.fg : undefined }}>{rupeesWithSymbol(s.cash)}</Mono> },
              { key: 'upi', header: 'UPI', align: 'right', width: 110, render: (s) => <Mono>{rupeesWithSymbol(s.upi)}</Mono> },
              { key: 'bank', header: 'Bank', align: 'right', width: 110, render: (s) => <Mono>{rupeesWithSymbol(s.bank)}</Mono> },
              { key: 'total', header: 'Total', align: 'right', width: 120, render: (s) => <Mono sx={{ fontWeight: 600 }}>{rupeesWithSymbol(s.total)}</Mono> },
            ]}
          />
        )}
      </Panel>

      <Panel
        label="Every payment"
        subtitle={d ? `${d.count} payments${reversals ? ` · ${reversals} reversed` : ''}. Newest first.` : undefined}
        sx={{ mt: 5, p: { xs: '14px 12px 12px', sm: '18px 20px 14px' } }}
      >
        {error || !d || d.payments.length === 0 ? (
          <EmptyState title={error ? error : d ? empty : 'Loading…'} />
        ) : phone ? (
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            {d.payments.map((p) => (
              <Box
                key={p.id}
                component={RouterLink}
                to={`/payments/riders/${p.riderId}`}
                sx={{
                  py: 2.5,
                  color: 'inherit',
                  textDecoration: 'none',
                  borderBottom: `1px solid ${neutral[900]}`,
                  '&:last-of-type': { border: 0 },
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 2,
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: 14 }}>{p.riderName}</Typography>
                  <Typography sx={{ fontSize: 12, color: neutral[500] }}>
                    {when(p)} · {p.reversesId ? 'Reversal' : PAYMENT_METHOD_LABEL[p.method]} · {p.by ?? '—'}
                    {p.reason ? ` · ${p.reason}` : ''}
                  </Typography>
                </Box>
                <Box sx={{ textAlign: 'right', flex: 'none' }}>
                  <Mono sx={{ fontSize: 14, color: p.amount < 0 ? tones.bad.fg : tones.good.fg }}>{money(p.amount)}</Mono>
                  <Mono sx={{ display: 'block', fontSize: 11.5, color: neutral[500] }}>{change(p)}</Mono>
                </Box>
              </Box>
            ))}
          </Box>
        ) : (
          <SimpleTable
            rows={d.payments}
            getRowKey={(p) => p.id}
            scrollable
            columns={[
              {
                key: 'time',
                header: oneDay ? 'Time' : 'When',
                width: oneDay ? 70 : 130,
                render: (p) => <Mono sx={{ fontSize: 12.5, color: neutral[400] }}>{when(p)}</Mono>,
              },
              {
                key: 'rider',
                header: 'Rider',
                render: (p) => (
                  <Box component={RouterLink} to={`/payments/riders/${p.riderId}`} sx={{ color: 'inherit', textDecoration: 'none' }}>
                    <Typography sx={{ fontSize: 14 }}>{p.riderName}</Typography>
                    <Mono sx={{ fontSize: 12, color: neutral[500] }}>{p.riderId}</Mono>
                  </Box>
                ),
              },
              { key: 'method', header: 'Method', width: 110, render: (p) => (p.reversesId ? 'Reversal' : PAYMENT_METHOD_LABEL[p.method]) },
              { key: 'by', header: 'By', width: 140, render: (p) => <Typography sx={{ fontSize: 13, color: neutral[400] }}>{p.by ?? '—'}</Typography> },
              {
                key: 'amount',
                header: 'Amount',
                align: 'right',
                width: 120,
                render: (p) => <Mono sx={{ color: p.amount < 0 ? tones.bad.fg : tones.good.fg }}>{money(p.amount)}</Mono>,
              },
              { key: 'change', header: 'Owed before → after', align: 'right', width: 210, render: (p) => <Mono sx={{ fontSize: 12.5, color: neutral[400] }}>{change(p)}</Mono> },
              {
                key: 'note',
                header: '',
                width: 150,
                render: (p) => <Typography sx={{ fontSize: 12, color: p.reversesId ? tones.bad.fg : neutral[500] }}>{p.reason ?? p.receiptNo ?? ''}</Typography>,
              },
            ]}
          />
        )}
      </Panel>
    </>
  );
}
