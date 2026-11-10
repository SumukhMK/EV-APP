import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useSession } from '../../../app/sessionContext';
import { listInspectableVehicles } from '../../../lib/api/inspections';
import { createServiceJob, listServiceJobs } from '../../../lib/api/serviceJobs';
import { invalidateServiceJobs } from '../../../lib/invalidate';
import type { ServiceJob } from '../../../types';
import { CostLines } from './CostLines';
import { linesValid, repairTypeOf, toItems, type CostLine } from './lineItems';
import { JobCardDialog } from './JobCardDialog';
import { fullWidth } from './layout';

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
  const [lines, setLines] = useState<CostLine[]>([]);
  const [executive, setExecutive] = useState(user.name);
  const [technician, setTechnician] = useState('');
  const [remarks, setRemarks] = useState('');
  // QC happens when the card is closed, so a card opens on the bench or waiting for parts.
  const [waiting, setWaiting] = useState(false);
  const [reference, setReference] = useState('');

  const vehicles = useQuery({ queryKey: ['vehicles', 'inspectable'], queryFn: listInspectableVehicles, enabled: open });
  const jobs = useQuery({ queryKey: ['service-jobs', 'list'], queryFn: () => listServiceJobs(), enabled: open });
  const eligible = (vehicles.data ?? []).filter((v) =>
    (v.state === 'RETURNED' || v.state === 'RECOVERY') && !v.currentRiderId &&
    !(jobs.data ?? []).some((j) => j.vehicleId === v.id && j.status !== 'CLOSED'),
  );
  const vehicle = eligible.find((v) => v.id === vehicleId);
  const needsReference = waiting;
  const create = useMutation({
    mutationFn: () => createServiceJob({
      vehicleId: vehicle!.id, riderId: null,
      source: vehicle!.state === 'RECOVERY' ? 'RECOVERY' : 'DEBOARD',
      // The API still asks how bad the damage is; every hub card starts as small damage.
      damageCategory: 'MINOR',
      queue: waiting ? 'PARTS_WAITING' : 'MINOR_REPAIR', damageNotes: remarks.trim(),
      reference: needsReference ? reference.trim() : null,
      repairType: repairTypeOf(lines), items: toItems(lines), createdBy: executive.trim(), technician: technician.trim() || null, actor: user.name,
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
      helper="List the damaged parts now if you know them. You can add, change or remove them later from the job card."
      error={create.isError ? create.error.message : vehicles.isError ? vehicles.error.message : undefined}
      pending={create.isPending}
      ready={Boolean(vehicle) && Boolean(executive.trim()) && Boolean(remarks.trim()) && (!needsReference || Boolean(reference.trim())) && linesValid(lines)}
      onSubmit={() => create.mutate()}
      onClose={onClose}
    >
      <TextField select required label="Eligible Inactive Vehicle (Returned / Recovery)" value={vehicleId}
        onChange={(e) => setVehicleId(e.target.value)}
        helperText="Only inactive vehicles returned by riders or recovered from riders should appear here."
      >
        <MenuItem value="" disabled>Select returned or recovered vehicle</MenuItem>
        {eligible.map((v) => (
          <MenuItem key={v.id} value={v.id}>{v.id} — {v.state === 'RECOVERY' ? 'Recovered' : 'Returned'}</MenuItem>
        ))}
      </TextField>
      <ToggleButtonGroup exclusive color="primary" value={waiting ? 'PARTS_WAITING' : 'UNDER_REPAIR'} aria-label="Status" sx={{ alignSelf: 'start' }}
        onChange={(_, next) => { if (next) setWaiting(next === 'PARTS_WAITING'); }}>
        <ToggleButton value="UNDER_REPAIR">Under Repair</ToggleButton>
        <ToggleButton value="PARTS_WAITING">Parts Waiting</ToggleButton>
      </ToggleButtonGroup>
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
      <CostLines lines={lines} onChange={setLines} sx={fullWidth} />
    </JobCardDialog>
  );
}
