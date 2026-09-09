import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import ArrowIcon from '@mui/icons-material/ArrowRightAltOutlined';
import HistoryIcon from '@mui/icons-material/HistoryOutlined';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { EmptyState } from '../../components/EmptyState';
import { Mono } from '../../components/Mono';
import { SimpleTable } from '../../components/SimpleTable';
import { TableFooter } from '../../components/TableFooter';
import { listAuditEvents } from '../../lib/api/audit';
import { formatDateTime } from '../../lib/format';
import { neutral } from '../../theme/tokens';
import type { AuditEvent } from '../../types';

const PAGE_SIZE = 12;

/** The before → after pair, or a plain dash where one side is empty. */
function Change({ before, after }: { before: string | null; after: string | null }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
      <Box component="span" sx={{ color: before ? neutral[400] : neutral[600] }}>
        {before ?? '—'}
      </Box>
      <ArrowIcon sx={{ fontSize: 16, color: neutral[600] }} />
      <Box component="span" sx={{ color: after ? neutral[200] : neutral[600] }}>
        {after ?? '—'}
      </Box>
    </Box>
  );
}

/**
 * The append-only record of every change to money, KYC and assignments
 * (artboard 19): who did it, when, and the before/after. A correction is a new
 * row, never an edit of an old one — the same rule the backend will enforce —
 * so this screen only ever reads, it has no controls at all.
 */
export function AuditLog() {
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down('md'));
  const stacked = useMediaQuery(theme.breakpoints.down('sm'));
  const [page, setPage] = useState(0);

  const log = useQuery({
    queryKey: ['audit', 'list', page],
    queryFn: () => listAuditEvents(page, PAGE_SIZE),
    placeholderData: keepPreviousData,
  });

  const rows = log.data?.content ?? [];
  const total = log.data?.totalElements ?? 0;

  return (
    <>
      <PageHeader
        section="Admin"
        title="Audit log"
        icon={HistoryIcon}
        meta={
          <Mono sx={{ fontSize: 12, color: neutral[500] }}>
            {total > 0 ? `${total} events` : ''}
          </Mono>
        }
      />

      <Panel sx={{ mt: 5, p: { xs: '4px 12px 12px', sm: '4px 20px 12px' } }}>
        {log.isLoading ? (
          <EmptyState title="Loading…" />
        ) : rows.length === 0 ? (
          <EmptyState title="Nothing recorded yet" />
        ) : stacked ? (
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            {rows.map((e) => (
              <Box
                key={e.id}
                sx={{ py: 3.5, borderBottom: `1px solid ${neutral[900]}`, '&:last-of-type': { border: 0 } }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 3, flexWrap: 'wrap' }}>
                  <Typography sx={{ fontSize: 14 }}>{e.action}</Typography>
                  <Mono sx={{ fontSize: 12, color: neutral[500] }}>{formatDateTime(e.occurredAt)}</Mono>
                </Box>
                <Mono sx={{ display: 'block', fontSize: 12, color: neutral[400], mt: 1 }}>{e.entity}</Mono>
                <Box sx={{ fontSize: 13, mt: 2 }}>
                  <Change before={e.before} after={e.after} />
                </Box>
                <Typography sx={{ fontSize: 12, color: neutral[500], mt: 1.5 }}>{e.actor}</Typography>
              </Box>
            ))}
          </Box>
        ) : (
          <SimpleTable
            rows={rows}
            getRowKey={(e) => e.id}
            columns={[
              {
                key: 'when',
                header: 'When',
                width: 170,
                render: (e) => <Mono sx={{ fontSize: 12, color: neutral[400] }}>{formatDateTime(e.occurredAt)}</Mono>,
              },
              { key: 'action', header: 'Action', width: 160, render: (e) => e.action },
              {
                key: 'entity',
                header: 'Entity',
                width: 200,
                render: (e) => <Mono sx={{ fontSize: 12, color: neutral[300] }}>{e.entity}</Mono>,
              },
              {
                key: 'change',
                header: 'Change',
                width: 260,
                render: (e: AuditEvent) => <Change before={e.before} after={e.after} />,
              },
              ...(compact
                ? []
                : [
                    {
                      key: 'actor',
                      header: 'Actor',
                      align: 'right' as const,
                      width: 150,
                      render: (e: AuditEvent) => (
                        <Box component="span" sx={{ color: neutral[400] }}>{e.actor}</Box>
                      ),
                    },
                  ]),
            ]}
          />
        )}
        {total > PAGE_SIZE && (
          <TableFooter
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onPageChange={setPage}
            noun="events"
          />
        )}
      </Panel>

      <Typography sx={{ fontSize: 12, color: neutral[500], mt: 3 }}>
        Append-only. A correction is recorded as a new event, never by editing an old one — so the log
        is read-only by design.
      </Typography>
    </>
  );
}
