import { useState } from 'react';
import SupportAgentIcon from '@mui/icons-material/SupportAgentOutlined';
import AddIcon from '@mui/icons-material/AddOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
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
import { RecordSearchSelect } from '../../components/RecordSearchSelect';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import { invalidateServiceJobs } from '../../lib/invalidate';
import { closeServiceJob, createServiceJob, listServiceJobs } from '../../lib/api/serviceJobs';
import { listInspectableVehicles } from '../../lib/api/vehicles';
import { formatDate, rupees, rupeesWithSymbol } from '../../lib/format';
import { VEHICLE_STATE_LABEL } from '../../lib/labels';
import { accent, neutral, type StatusTone } from '../../theme/tokens';
import { useSession } from '../../app/sessionContext';
import { canCloseServiceJob } from '../../lib/roles';
import type { DamageCategory, ServiceJob, ServiceJobItem, ServiceLiability, ServiceJobSource } from '../../types';

const CATEGORY_TONE: Record<DamageCategory, StatusTone> = {
  NONE: 'neutral',
  MINOR: 'caution',
  MAJOR: 'warn',
  ACCIDENT: 'bad',
};

const CATEGORY_LABEL: Record<DamageCategory, string> = {
  NONE: 'None',
  MINOR: 'Minor',
  MAJOR: 'Major',
  ACCIDENT: 'Accident',
};

const SOURCE_LABEL: Record<ServiceJobSource, string> = {
  DEBOARD: 'Deboard',
  RSA: 'Roadside assistance',
  QRT: 'Quick response team',
  WALK_IN: 'Walk-in',
};

const LIABILITY_OPTIONS: Array<{ value: ServiceLiability; label: string }> = [
  { value: 'DEPOSIT', label: 'Deduct from deposit' },
  { value: 'RIDER', label: 'Charge the rider' },
  { value: 'COMPANY', label: 'Write off (company)' },
];

const LOGGABLE_SOURCES: Array<{ value: ServiceJobSource; label: string }> = [
  { value: 'WALK_IN', label: 'Walk-in' },
  { value: 'RSA', label: 'RSA' },
  { value: 'QRT', label: 'QRT' },
];

const LOGGABLE_CATEGORIES: Array<{ value: DamageCategory; label: string }> = [
  { value: 'MINOR', label: 'Minor' },
  { value: 'MAJOR', label: 'Major' },
  { value: 'ACCIDENT', label: 'Accident' },
];

/** One priced line while the desk is still working the job — cost typed as a string so a half-entered number does not fight the field. */
interface DraftItem {
  label: string;
  costRupees: string;
}

/**
 * Where an RSA call, a QRT dispatch, a walk-in, or a deboard's damage tag gets
 * worked: the desk opens the job, prices what it actually took — part by
 * part — and says who is liable. Closing is the one action in this screen,
 * because that is the one action that turns a job into money: a `RIDER` or
 * `DEPOSIT` liability posts straight through to that rider's `RiderCharge`
 * ledger, which the weekly run reads without anyone re-typing a number.
 *
 * A deboard tags a job automatically. RSA, QRT and a walk-in do not have an
 * upstream form of their own, so this screen is also where that team logs
 * one in the first place — "New job" below "Open job".
 */
export function AssistanceDesk() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const canWork = canCloseServiceJob(user.roleKey);
  const [opening, setOpening] = useState<ServiceJob | null>(null);
  const [items, setItems] = useState<DraftItem[]>([{ label: '', costRupees: '' }]);
  const [liability, setLiability] = useState<ServiceLiability>('RIDER');
  const [technician, setTechnician] = useState('');

  const [logging, setLogging] = useState(false);
  const [newVehicleId, setNewVehicleId] = useState('');
  const [newSource, setNewSource] = useState<ServiceJobSource>('WALK_IN');
  const [newCategory, setNewCategory] = useState<DamageCategory>('MINOR');
  const [newNotes, setNewNotes] = useState('');

  const jobs = useQuery({ queryKey: ['service-jobs', 'open'], queryFn: () => listServiceJobs() });
  const openJobs = (jobs.data ?? []).filter((j) => j.status !== 'CLOSED');

  const eligibleVehicles = useQuery({
    queryKey: ['vehicles', 'inspectable'],
    queryFn: listInspectableVehicles,
    enabled: logging,
  });
  const pickedVehicle = eligibleVehicles.data?.find((v) => v.id === newVehicleId) ?? null;

  const close = useMutation({
    mutationFn: (payload: { jobId: string; items: ServiceJobItem[]; liability: ServiceLiability; technician: string | null }) =>
      closeServiceJob(payload),
    onSuccess: () => {
      invalidateServiceJobs(queryClient);
      setOpening(null);
    },
  });

  const log = useMutation({
    mutationFn: () =>
      createServiceJob({
        vehicleId: newVehicleId,
        riderId: pickedVehicle?.currentRiderId ?? null,
        source: newSource,
        damageCategory: newCategory,
        damageNotes: newNotes.trim() || null,
      }),
    onSuccess: () => {
      invalidateServiceJobs(queryClient);
      setLogging(false);
      setNewVehicleId('');
      setNewSource('WALK_IN');
      setNewCategory('MINOR');
      setNewNotes('');
    },
  });

  function startWorking(job: ServiceJob) {
    setOpening(job);
    setItems([{ label: '', costRupees: '' }]);
    setLiability('RIDER');
    setTechnician('');
  }

  const validItems = items
    .map((i) => ({ label: i.label.trim(), costPaise: Math.round((Number(i.costRupees) || 0) * 100) }))
    .filter((i) => i.label.length > 0 && i.costPaise > 0);

  const totalPaise = validItems.reduce((sum, i) => sum + i.costPaise, 0);
  const highValue = totalPaise > 500000;

  return (
    <>
      <PageHeader
        section="Service management"
        title="Assistance desk"
        icon={SupportAgentIcon}
        meta={
          <Mono sx={{ fontSize: 12, color: neutral[500] }}>
            {openJobs.length} job{openJobs.length === 1 ? '' : 's'} open
          </Mono>
        }
        actions={
          canWork ? (
            <Button startIcon={<AddIcon />} onClick={() => setLogging(true)}>
              New job
            </Button>
          ) : undefined
        }
      />

      <Panel sx={{ mt: 5, p: { xs: '4px 12px 12px', sm: '4px 20px 12px' } }}>
        {openJobs.length === 0 ? (
          <EmptyState
            title="Nothing open"
            description="Jobs appear here from a deboard's damage tag, or from New job above for an RSA or QRT call and a walk-in."
          />
        ) : (
          <SimpleTable
            rows={openJobs}
            getRowKey={(j) => j.id}
            columns={[
              { key: 'id', header: 'Job', width: 110, render: (j) => <Mono sx={{ color: accent[300] }}>{j.id}</Mono> },
              { key: 'vehicle', header: 'Vehicle', width: 110, render: (j) => <Mono>{j.vehicleId}</Mono> },
              { key: 'source', header: 'Source', width: 150, render: (j) => SOURCE_LABEL[j.source] },
              {
                key: 'category',
                header: 'Damage',
                width: 110,
                render: (j) => <StateChip label={CATEGORY_LABEL[j.damageCategory]} tone={CATEGORY_TONE[j.damageCategory]} />,
              },
              {
                key: 'notes',
                header: 'Notes',
                width: 260,
                render: (j) => <Box component="span" sx={{ color: neutral[400] }}>{j.damageNotes || '—'}</Box>,
              },
              { key: 'opened', header: 'Opened', width: 110, render: (j) => <Mono sx={{ fontSize: 13 }}>{formatDate(j.createdOn)}</Mono> },
              {
                key: 'action',
                header: 'Action',
                align: 'right',
                width: 130,
                render: (j) =>
                  canWork ? (
                    <Button onClick={() => startWorking(j)} disabled={close.isPending}>
                      Open job
                    </Button>
                  ) : (
                    <Box component="span" sx={{ color: neutral[500], fontSize: 12 }}>View only</Box>
                  ),
              },
            ]}
          />
        )}
      </Panel>

      <Typography sx={{ fontSize: 12, color: neutral[500], mt: 3 }}>
        Closing a job with the rider or the deposit liable posts a charge straight to that rider's
        payment record — the weekly run and the rider's ledger pick it up without re-entry.
      </Typography>

      <Dialog open={Boolean(opening)} onClose={() => setOpening(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontSize: 16 }}>
          Work job · {opening?.id} · {opening?.vehicleId}
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 13, color: 'text.secondary', mb: 4 }}>
            {opening && SOURCE_LABEL[opening.source]} · {opening && CATEGORY_LABEL[opening.damageCategory]} damage
            {opening?.damageNotes ? ` — ${opening.damageNotes}` : ''}
          </Typography>

          <Typography variant="overline">Line items</Typography>
          <Box sx={{ display: 'grid', gap: 3, mt: 2 }}>
            {items.map((item, index) => (
              <Box key={index} sx={{ display: 'grid', gridTemplateColumns: '1fr 140px auto', gap: 2, alignItems: 'start' }}>
                <TextField
                  label="Part / work done"
                  size="small"
                  value={item.label}
                  onChange={(e) => {
                    const next = [...items];
                    next[index] = { ...next[index], label: e.target.value };
                    setItems(next);
                  }}
                />
                <TextField
                  label="Cost (₹)"
                  size="small"
                  type="number"
                  value={item.costRupees}
                  onChange={(e) => {
                    const next = [...items];
                    next[index] = { ...next[index], costRupees: e.target.value };
                    setItems(next);
                  }}
                />
                <IconButton
                  aria-label="Remove item"
                  size="small"
                  onClick={() => setItems(items.filter((_, i) => i !== index))}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Box>
            ))}
            <Box>
              <Button size="small" startIcon={<AddIcon />} onClick={() => setItems([...items, { label: '', costRupees: '' }])}>
                Add line item
              </Button>
            </Box>
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 3, mt: 5 }}>
            <TextField
              select
              label="Liability"
              size="small"
              value={liability}
              onChange={(e) => setLiability(e.target.value as ServiceLiability)}
            >
              {LIABILITY_OPTIONS.map((o) => (
                <MenuItem key={o.value} value={o.value}>
                  {o.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Technician"
              size="small"
              value={technician}
              onChange={(e) => setTechnician(e.target.value)}
            />
          </Box>

          <Stack direction="row" sx={{ mt: 5, justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>Total</Typography>
            <Mono sx={{ fontSize: 16 }}>{rupees(totalPaise)}</Mono>
          </Stack>
          {highValue && (
            <Typography sx={{ fontSize: 12.5, color: 'warning.main', mt: 2 }}>
              Flagged for review — this job is over {rupeesWithSymbol(500000)}.
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 6, pb: 5 }}>
          <Button color="inherit" onClick={() => setOpening(null)}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              opening &&
              close.mutate({
                jobId: opening.id,
                items: validItems,
                liability,
                technician: technician.trim() || null,
              })
            }
            disabled={validItems.length === 0 || close.isPending}
          >
            {close.isPending ? 'Closing…' : 'Close job'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={logging} onClose={() => setLogging(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontSize: 16 }}>Log a job</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 13, color: 'text.secondary', mb: 4 }}>
            For an RSA call, a QRT dispatch, or a walk-in — a deboard tags its own job automatically
            and does not need one logged here.
          </Typography>

          <Box sx={{ display: 'grid', gap: 4 }}>
            <RecordSearchSelect
              label="Vehicle"
              placeholder="Search a bike"
              value={newVehicleId}
              onChange={setNewVehicleId}
              options={(eligibleVehicles.data ?? []).map((v) => ({
                id: v.id,
                primary: v.model,
                secondary: VEHICLE_STATE_LABEL[v.state],
                trailing: v.currentRiderName ?? v.chassisNumber,
              }))}
              loading={eligibleVehicles.isLoading}
            />

            <Box>
              <Typography variant="overline" sx={{ mb: 1.5, display: 'block' }}>
                Source
              </Typography>
              <ToggleButtonGroup
                exclusive
                size="small"
                value={newSource}
                onChange={(_, next) => next && setNewSource(next)}
              >
                {LOGGABLE_SOURCES.map((s) => (
                  <ToggleButton key={s.value} value={s.value} sx={{ px: 4, textTransform: 'none', fontSize: 13 }}>
                    {s.label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>

            <Box>
              <Typography variant="overline" sx={{ mb: 1.5, display: 'block' }}>
                Damage category
              </Typography>
              <ToggleButtonGroup
                exclusive
                size="small"
                value={newCategory}
                onChange={(_, next) => next && setNewCategory(next)}
              >
                {LOGGABLE_CATEGORIES.map((c) => (
                  <ToggleButton key={c.value} value={c.value} sx={{ px: 4, textTransform: 'none', fontSize: 13 }}>
                    {c.label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>

            <TextField
              label="Notes"
              multiline
              minRows={2}
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              placeholder="What was reported, where, what it needs"
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 6, pb: 5 }}>
          <Button color="inherit" onClick={() => setLogging(false)}>
            Cancel
          </Button>
          <Button onClick={() => log.mutate()} disabled={!newVehicleId || log.isPending}>
            {log.isPending ? 'Logging…' : 'Log job'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
