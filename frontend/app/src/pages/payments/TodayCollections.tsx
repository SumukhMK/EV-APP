import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Link as RouterLink } from 'react-router-dom';
import TodayIcon from '@mui/icons-material/EventAvailableOutlined';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { StatTiles } from '../../components/StatTiles';
import { EmptyState } from '../../components/EmptyState';
import { Mono } from '../../components/Mono';
import { SimpleTable } from '../../components/SimpleTable';
import { getTodayCollections } from '../../lib/api/payments';
import { PAYMENT_METHOD_LABEL } from '../../lib/labels';
import { formatDate, rupeesWithSymbol } from '../../lib/format';
import { neutral, status as tones } from '../../theme/tokens';
import { money } from './money';
import type { Payment } from '../../types';

const isoDay = (d: Date) => {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
};
const shift = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return isoDay(d);
};
const time = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));

/**
 * The end-of-day count: what came in, by who took it and how. Cash is what
 * each person should be holding; UPI and bank went straight to the account.
 * A reversal comes off the totals of whoever took the original payment.
 */
export function TodayCollections() {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const todayIso = isoDay(new Date());
  const [date, setDate] = useState(todayIso);

  const day = useQuery({
    queryKey: ['payments', 'today', date],
    queryFn: () => getTodayCollections(date),
    placeholderData: keepPreviousData,
  });
  const d = day.data;
  const cash = d?.byStaff.reduce((t, s) => t + s.cash, 0) ?? 0;
  const upi = d?.byStaff.reduce((t, s) => t + s.upi, 0) ?? 0;
  const bank = d?.byStaff.reduce((t, s) => t + s.bank, 0) ?? 0;
  const reversals = d?.payments.filter((p) => p.reversesId).length ?? 0;

  const change = (p: Payment) =>
    p.owedBefore == null || p.owedAfter == null
      ? '—'
      : `${money(p.owedBefore)} → ${money(p.owedAfter)}`;

  return (
    <>
      <PageHeader
        section="Money"
        title={date === todayIso ? "Today's collections" : `Collections on ${formatDate(date)}`}
        icon={TodayIcon}
        backTo="/payments/collections"
        backLabel="Collections"
        actions={
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button color="inherit" size="small" onClick={() => setDate(shift(date, -1))} sx={{ minHeight: 36 }}>
              ‹ Day before
            </Button>
            <Button
              color="inherit"
              size="small"
              onClick={() => setDate(date === todayIso ? date : shift(date, 1))}
              aria-disabled={date === todayIso}
              sx={{ minHeight: 36, opacity: date === todayIso ? 0.4 : 1 }}
            >
              Next day ›
            </Button>
          </Box>
        }
      />

      <Box sx={{ mt: 4.5 }}>
        <StatTiles
          tiles={[
            {
              label: 'Collected',
              value: d ? rupeesWithSymbol(d.total) : '—',
              tone: 'good',
            },
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
        {!d ? (
          <EmptyState title="Loading…" />
        ) : d.byStaff.length === 0 ? (
          <EmptyState title="No payments on this day" />
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
        {!d || d.payments.length === 0 ? (
          <EmptyState title={d ? 'No payments on this day' : 'Loading…'} />
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
                    {time(p.at)} · {p.reversesId ? 'Reversal' : PAYMENT_METHOD_LABEL[p.method]} · {p.by ?? '—'}
                    {p.reason ? ` · ${p.reason}` : ''}
                  </Typography>
                </Box>
                <Box sx={{ textAlign: 'right', flex: 'none' }}>
                  <Mono sx={{ fontSize: 14, color: p.amount < 0 ? tones.bad.fg : tones.good.fg }}>
                    {money(p.amount)}
                  </Mono>
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
              { key: 'time', header: 'Time', width: 70, render: (p) => <Mono sx={{ fontSize: 12.5, color: neutral[400] }}>{time(p.at)}</Mono> },
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
                render: (p) => (
                  <Mono sx={{ color: p.amount < 0 ? tones.bad.fg : tones.good.fg }}>
                    {money(p.amount)}
                  </Mono>
                ),
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
