import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useSession } from '../../../app/sessionContext';
import { listInspectableVehicles } from '../../../lib/api/inspections';
import { createServiceJob, listServiceJobs } from '../../../lib/api/serviceJobs';
import { invalidateServiceJobs } from '../../../lib/invalidate';
import { REPAIR_TYPE_LABEL, SERVICE_CATEGORY_LABEL } from '../../../lib/serviceJobLabels';
import { JOB_STAGE_LABEL } from '../../../lib/serviceWorkflow';
import type { RepairType, ServiceJob, ServiceQueue } from '../../../types';
import { JobCardDialog, ReadOnlyField } from './JobCardDialog';
import { fullWidth } from './layout';

const REPAIR_TYPES = ['REPAIR_ONLY', 'SPARE_PARTS', 'REPAIR_AND_SPARE_PARTS'] as const;
/** The three stages a card can be opened into; Closed is reached by passing QC. */
const OPENING_STAGES = ['UNDER_REPAIR', 'PARTS_WAITING', 'QC_PENDING'] as const;
type OpeningStage = (typeof OPENING_STAGES)[number];
const STAGE_QUEUE: Record<OpeningStage, ServiceQueue> = {
  UNDER_REPAIR: 'MINOR_REPAIR', PARTS_WAITING: 'PARTS_WAITING', QC_PENDING: 'QC_PENDING',
};

/**
 * Open a card for a bike nobody is riding. The picker is the whole rule: a
 * bike qualifies if it came back or was recovered, has no rider on it, and has
 * no card open already (SERVICE_INFRA_SPLIT.md, decision 11).
 */
export function HubJobCardDialog({ open, onClose, onCreated }: {
  open: boolean;
  onClose: () => void;
  onCreated: (job: ServiceJob) => void;
}) {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [vehicleId, setVehicleId] = useState('');
  const [repairType, setRepairType] = useState<RepairType>('REPAIR_ONLY');
  const [executive, setExecutive] = useState(user.name);
  const [technician, setTechnician] = useState('');
  const [remarks, setRemarks] = useState('');
  const [stage, setStage] = useState<OpeningStage>('UNDER_REPAIR');
  const [reference, setReference] = useState('');

  const vehicles = useQuery({ queryKey: ['vehicles', 'inspectable'], queryFn: listInspectableVehicles, enabled: open });
  const jobs = useQuery({ queryKey: ['service-jobs', 'list'], queryFn: () => listServiceJobs(), enabled: open });
  const eligible = (vehicles.data ?? []).filter((v) =>
    (v.state === 'RETURNED' || v.state === 'RECOVERY') && !v.currentRiderId &&
    !(jobs.data ?? []).some((j) => j.vehicleId === v.id && j.status !== 'CLOSED'),
  );
  const vehicle = eligible.find((v) => v.id === vehicleId);
  const needsReference = stage === 'PARTS_WAITING';
  const create = useMutation({
    mutationFn: () => createServiceJob({
      vehicleId: vehicle!.id, riderId: null,
      source: vehicle!.state === 'RECOVERY' ? 'RECOVERY' : 'DEBOARD',
      // The API still asks how bad the damage is; a card opened straight into
      // QC has nothing to repair, anything else starts as small damage.
      damageCategory: stage === 'QC_PENDING' ? 'NONE' : 'MINOR',
      queue: STAGE_QUEUE[stage], damageNotes: remarks.trim(),
      reference: needsReference ? reference.trim() : null,
      repairType, createdBy: executive.trim(), technician: technician.trim() || null, actor: user.name,
    }),
    onSuccess: (job) => {
      invalidateServiceJobs(queryClient);
      onCreated(job);
    },
  });
  const conflict = create.error?.message.includes('already has an open service job')
    || create.error?.message.includes("already has an open job");
  const openJob = conflict
    ? jobs.data?.find((job) => job.vehicleId === vehicle?.id && job.status !== 'CLOSED')
    : undefined;
  useEffect(() => {
    if (conflict) void jobs.refetch();
  // Refresh to include a job opened concurrently by another operator.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conflict]);
  const error = create.isError ? create.error.message : vehicles.isError ? vehicles.error.message : undefined;
  const errorAction = conflict && openJob ? (
    <Link to={`/service/assistance/${encodeURIComponent(openJob.id)}`} style={{ fontWeight: 700 }}>
      Open job {openJob.id}
    </Link>
  ) : undefined;

  return (
    <JobCardDialog
      open={open}
      title="Open Hub Service Job Card"
      subtitle="Hub Service is only for inactive vehicles returned by riders or recovered from riders. No rider payment fields are used."
      helper={repairType === 'REPAIR_ONLY'
        ? 'Repair-only job card: no spare part is required.'
        : 'Spare parts must be added before the job card is closed.'}
      error={error}
      errorAction={errorAction}
      pending={create.isPending}
      ready={Boolean(vehicle) && Boolean(executive.trim()) && Boolean(remarks.trim()) && (!needsReference || Boolean(reference.trim()))}
      onSubmit={() => create.mutate()}
      onClose={onClose}
    >
      <ReadOnlyField label="Service Category" value={SERVICE_CATEGORY_LABEL.HUB} />
      <TextField select required label="Eligible Inactive Vehicle (Returned / Recovery)" value={vehicleId}
        onChange={(e) => setVehicleId(e.target.value)}
        helperText="Only inactive vehicles returned by riders or recovered from riders should appear here."
      >
        <MenuItem value="" disabled>Select returned or recovered vehicle</MenuItem>
        {eligible.map((v) => (
          <MenuItem key={v.id} value={v.id}>{v.id} — {v.state === 'RECOVERY' ? 'Recovered' : 'Returned'}</MenuItem>
        ))}
      </TextField>
      <TextField select label="Repair Type" value={repairType} onChange={(e) => setRepairType(e.target.value as RepairType)}>
        {REPAIR_TYPES.map((t) => <MenuItem key={t} value={t}>{REPAIR_TYPE_LABEL[t]}</MenuItem>)}
      </TextField>
      <TextField select label="Hub Service Stage" value={stage} onChange={(e) => setStage(e.target.value as OpeningStage)}>
        {OPENING_STAGES.map((s) => <MenuItem key={s} value={s}>{JOB_STAGE_LABEL[s]}</MenuItem>)}
      </TextField>
      {needsReference && (
        <TextField required sx={fullWidth} label="Which parts, and when are they expected?"
          value={reference} onChange={(e) => setReference(e.target.value)} />
      )}
      <TextField required label="Ticket Created By (Executive)" value={executive} onChange={(e) => setExecutive(e.target.value)} />
      <TextField label="Ticket Resolved By (Technician)" value={technician} onChange={(e) => setTechnician(e.target.value)}
        placeholder="Enter technician when repair is done" />
      <TextField required multiline minRows={3} sx={fullWidth} label="Initial / Current Remarks"
        placeholder="Vehicle issue, inspection findings or repair notes"
        value={remarks} onChange={(e) => setRemarks(e.target.value)} />
    </JobCardDialog>
  );
}
