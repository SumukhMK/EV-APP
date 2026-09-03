import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { StateChip } from '../../components/StateChip';
import { EmptyState } from '../../components/EmptyState';
import { Mono } from '../../components/Mono';
import { SimpleTable } from '../../components/SimpleTable';
import { decideQc, listQcQueue } from '../../lib/api/vehicles';
import { formatDate, rupees } from '../../lib/format';
import { accent, neutral, type StatusTone } from '../../theme/tokens';
import type { QcQueueItem } from '../../types';

const CATEGORY_TONE: Record<QcQueueItem['category'], StatusTone> = {
  NONE: 'neutral',
  MINOR: 'caution',
  MAJOR: 'warn',
  ACCIDENT: 'bad',
  WARRANTY: 'neutral',
};

const CATEGORY_LABEL: Record<QcQueueItem['category'], string> = {
  NONE: 'None',
  MINOR: 'Minor',
  MAJOR: 'Major',
  ACCIDENT: 'Accident',
  WARRANTY: 'Warranty',
};

/**
 * The gate between a closed repair and a deployable bike. Pass moves it to
 * Ready to deploy; fail sends it back to Under repair with a reason, which is
 * why the fail path is a dialog and the pass path is not — a fail creates an
 * obligation on a named technician.
 */
export function QcQueue() {
  const queryClient = useQueryClient();
  const [failing, setFailing] = useState<QcQueueItem | null>(null);
  const [reason, setReason] = useState('');

  const queue = useQuery({ queryKey: ['qc', 'queue'], queryFn: listQcQueue });

  const decide = useMutation({
    mutationFn: ({ vehicleId, pass, why }: { vehicleId: string; pass: boolean; why?: string }) =>
      decideQc(vehicleId, pass, why),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qc', 'queue'] });
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      setFailing(null);
      setReason('');
    },
  });

  const items = queue.data ?? [];
  const oldest = items.reduce((max, i) => Math.max(max, i.daysWaiting), 0);

  return (
    <>
      <PageHeader
        section="Workshop"
        title="QC queue"
        meta={
          <Mono sx={{ fontSize: 12, color: neutral[500] }}>
            {items.length} awaiting QC{items.length > 0 ? ` · oldest ${oldest} days` : ''}
          </Mono>
        }
      />

      <Panel sx={{ mt: 5, p: '4px 20px 12px' }}>
        {items.length === 0 ? (
          <EmptyState
            title="Nothing waiting on QC"
            description="Bikes appear here when a technician closes a repair."
          />
        ) : (
          <SimpleTable
            rows={items}
            getRowKey={(q) => q.vehicleId}
            columns={[
              {
                key: 'id',
                header: 'Vehicle id',
                width: 120,
                render: (q) => <Mono sx={{ color: accent[300] }}>{q.vehicleId}</Mono>,
              },
              { key: 'model', header: 'Model', width: 160, render: (q) => q.model },
              {
                key: 'summary',
                header: 'Repair summary',
                render: (q) => <Box component="span" sx={{ color: neutral[300] }}>{q.repairSummary}</Box>,
              },
              {
                key: 'category',
                header: 'Category',
                width: 110,
                render: (q) => <StateChip label={CATEGORY_LABEL[q.category]} tone={CATEGORY_TONE[q.category]} />,
              },
              { key: 'tech', header: 'Technician', width: 130, render: (q) => q.technician },
              {
                key: 'closed',
                header: 'Closed',
                width: 130,
                render: (q) => <Mono sx={{ fontSize: 13 }}>{formatDate(q.closedOn)}</Mono>,
              },
              {
                key: 'cost',
                header: 'Cost',
                align: 'right',
                width: 90,
                render: (q) => <Mono>{rupees(q.costPaise)}</Mono>,
              },
              {
                key: 'action',
                header: 'Action',
                align: 'right',
                width: 150,
                render: (q) => (
                  <Stack direction="row" spacing={1.5} sx={{ justifyContent: 'flex-end' }}>
                    <Button color="inherit" onClick={() => setFailing(q)}>
                      Fail
                    </Button>
                    <Button
                      onClick={() => decide.mutate({ vehicleId: q.vehicleId, pass: true })}
                      disabled={decide.isPending}
                    >
                      Pass
                    </Button>
                  </Stack>
                ),
              },
            ]}
          />
        )}
      </Panel>

      <Typography sx={{ fontSize: 12, color: neutral[500], mt: 3 }}>
        Pass moves the vehicle to Ready to deploy. Fail returns it to Under repair with a reason and
        re-opens the job for the technician.
      </Typography>

      <Dialog open={Boolean(failing)} onClose={() => setFailing(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: 16 }}>Confirm QC fail · {failing?.vehicleId}</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 13, color: 'text.secondary', mb: 4 }}>
            This returns the vehicle to Under repair and notifies {failing?.technician}. The QC record
            is kept in the audit log.
          </Typography>
          <TextField
            label="Reason"
            multiline
            minRows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            autoFocus
          />
        </DialogContent>
        <DialogActions sx={{ px: 6, pb: 5 }}>
          <Button color="inherit" onClick={() => setFailing(null)}>
            Cancel
          </Button>
          <Button
            onClick={() => failing && decide.mutate({ vehicleId: failing.vehicleId, pass: false, why: reason })}
            disabled={reason.trim().length === 0 || decide.isPending}
          >
            Fail QC
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
