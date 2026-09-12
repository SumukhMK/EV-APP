import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Snackbar from '@mui/material/Snackbar';
import Typography from '@mui/material/Typography';
import CheckIcon from '@mui/icons-material/CheckCircleOutlineOutlined';
import ErrorIcon from '@mui/icons-material/ErrorOutlineOutlined';
import PersonOffIcon from '@mui/icons-material/PersonOffOutlined';
import MoneyOffIcon from '@mui/icons-material/MoneyOffOutlined';
import GavelIcon from '@mui/icons-material/GavelOutlined';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { StatTiles } from '../../components/StatTiles';
import { StateChip } from '../../components/StateChip';
import { EmptyState } from '../../components/EmptyState';
import { Mono } from '../../components/Mono';
import { SimpleTable } from '../../components/SimpleTable';
import { listOverdueRiders } from '../../lib/api/payments';
import { DUNNING_LABEL, DUNNING_TONE } from '../../lib/labels';
import { rupees } from '../../lib/format';
import { accent, fonts, neutral, status as tones } from '../../theme/tokens';
import type { OverdueRider } from '../../types';

/**
 * Everyone behind on rent (artboard 17), worst first. The list is derived from
 * the rider fixtures, not held separately, so the dashboard tile, this list and
 * each rider record can never disagree — the wireframe's own two boards did.
 *
 * The dunning stage escalates with days overdue: a reminder, two warnings, then
 * repossession due. The Monday SMS reminder is a Phase 1 promise but the send
 * is a backend action, so a reminder here is acknowledged and remembered for
 * the session — it goes grey once sent so the same rider is not chased twice,
 * and "Remind all due" clears the whole list in one action.
 */
export function OverdueRiders() {
  const navigate = useNavigate();
  const [toast, setToast] = useState<string | null>(null);
  const [reminded, setReminded] = useState<Set<string>>(() => new Set());

  const overdue = useQuery({ queryKey: ['payments', 'overdue'], queryFn: listOverdueRiders });

  const rows = overdue.data ?? [];
  const totalDue = rows.reduce((t, o) => t + o.amountDue, 0);
  const repossession = rows.filter((o) => o.stage === 'REPOSSESSION_DUE').length;
  const pending = rows.filter((o) => !reminded.has(o.riderId)).length;

  const remind = (ids: string[], label: string) => {
    setReminded((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
    setToast(label);
  };

  return (
    <>
      <PageHeader
        section="Money"
        title="Overdue riders"
        icon={ErrorIcon}
        actions={
          rows.length > 0 ? (
            <Button
              disabled={pending === 0}
              onClick={() =>
                remind(
                  rows.map((o) => o.riderId),
                  `${pending} reminder${pending === 1 ? '' : 's'} queued`,
                )
              }
            >
              {pending === 0 ? 'All reminded' : `Remind all due (${pending})`}
            </Button>
          ) : undefined
        }
        meta={
          <Mono sx={{ fontSize: 12, color: neutral[500] }}>
            {rows.length} behind{rows.length > 0 ? ` · worst ${rows[0].daysOverdue} days` : ''}
          </Mono>
        }
      />

      <Box sx={{ mt: 4.5 }}>
        <StatTiles
          tiles={[
            { label: 'Overdue riders', value: overdue.data ? String(rows.length) : '—', tone: 'bad', icon: PersonOffIcon },
            { label: 'Amount outstanding', value: overdue.data ? rupees(totalDue) : '—', tone: 'bad', icon: MoneyOffIcon },
            {
              label: 'Repossession due',
              value: overdue.data ? String(repossession) : '—',
              tone: repossession > 0 ? 'bad' : 'good',
              icon: GavelIcon,
            },
          ]}
        />
      </Box>

      <Panel sx={{ mt: 5, p: { xs: '4px 12px 12px', sm: '4px 20px 12px' } }}>
        {overdue.isLoading ? (
          <EmptyState title="Loading…" />
        ) : rows.length === 0 ? (
          <EmptyState title="No one is overdue" description="Every rider is current on rent." />
        ) : (
          <SimpleTable
            rows={rows}
            getRowKey={(o) => o.riderId}
            scrollable
            columns={[
              {
                key: 'rider',
                header: 'Rider',
                width: 200,
                render: (o) => (
                  <Box
                    onClick={() => navigate(`/riders/${o.riderId}`)}
                    sx={{ cursor: 'pointer' }}
                  >
                    <Box component="span" sx={{ display: 'block' }}>{o.riderName}</Box>
                    <Mono sx={{ fontSize: 12, color: accent[300] }}>{o.riderId}</Mono>
                  </Box>
                ),
              },
              {
                key: 'vehicle',
                header: 'Vehicle',
                width: 120,
                render: (o) => <Mono sx={{ fontSize: 13, color: neutral[400] }}>{o.vehicleId}</Mono>,
              },
              {
                key: 'phone',
                header: 'Phone',
                width: 140,
                render: (o: OverdueRider) => (
                  <Box
                    component="a"
                    href={`tel:${o.phone}`}
                    onClick={(e: React.MouseEvent) => e.stopPropagation()}
                    sx={{
                      fontFamily: fonts.mono,
                      fontVariantNumeric: 'tabular-nums',
                      fontSize: 13,
                      color: accent[300],
                      textDecoration: 'none',
                      '&:hover': { textDecoration: 'underline' },
                    }}
                  >
                    {o.phone}
                  </Box>
                ),
              },
              {
                key: 'days',
                header: 'Days overdue',
                align: 'right',
                width: 120,
                render: (o) => (
                  <Mono sx={{ color: o.daysOverdue >= 21 ? undefined : neutral[300] }}>
                    {o.daysOverdue}
                  </Mono>
                ),
              },
              {
                key: 'amount',
                header: 'Amount due',
                align: 'right',
                width: 120,
                render: (o) => <Mono>{rupees(o.amountDue)}</Mono>,
              },
              {
                key: 'stage',
                header: 'Stage',
                width: 150,
                render: (o) => <StateChip label={DUNNING_LABEL[o.stage]} tone={DUNNING_TONE[o.stage]} />,
              },
              {
                key: 'action',
                header: 'Action',
                align: 'right',
                width: 150,
                render: (o: OverdueRider) =>
                  reminded.has(o.riderId) ? (
                    <Box
                      sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 1,
                        color: tones.good.fg,
                        fontSize: 13,
                      }}
                    >
                      <CheckIcon sx={{ fontSize: 16 }} /> Reminded
                    </Box>
                  ) : (
                    <Button
                      color="inherit"
                      size="small"
                      onClick={() => remind([o.riderId], `Reminder queued for ${o.riderName}`)}
                    >
                      Send reminder
                    </Button>
                  ),
              },
            ]}
          />
        )}
      </Panel>

      <Typography sx={{ fontSize: 12, color: neutral[500], mt: 3 }}>
        The Monday SMS reminder goes out through the notification queue once the backend exists. Here a
        reminder is acknowledged and greyed for the session so no one is chased twice; tap a phone
        number to call the rider directly.
      </Typography>

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={2600}
        onClose={() => setToast(null)}
        message={toast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </>
  );
}
