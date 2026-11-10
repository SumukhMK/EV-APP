import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useSession } from '../../../app/sessionContext';
import { listAssignedRiders } from '../../../lib/api/riders';
import { createServiceJob, listServiceJobs } from '../../../lib/api/serviceJobs';
import { invalidateServiceJobs } from '../../../lib/invalidate';
import type { ServiceJob } from '../../../types';
import { CostLines } from './CostLines';
import { linesValid, repairTypeOf, toItems, type CostLine } from './lineItems';
import { JobCardDialog, ReadOnlyField } from './JobCardDialog';
import { fullWidth } from './layout';

/**
 * Open a card for a bike a rider still holds. The rider is the only thing the
 * operator picks: the bike and the rider id follow from them, because a
 * walk-in is always "this rider, with the bike we gave them".
 */
export function WalkInJobCardDialog({ open, onClose, onCreated }: {
  open: boolean;
  onClose: () => void;
  onCreated: (job: ServiceJob) => void;
}) {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [source, setSource] = useState<'WALK_IN' | 'RSA'>('WALK_IN');
  const [riderId, setRiderId] = useState('');
  const [location, setLocation] = useState('');
  const [lines, setLines] = useState<CostLine[]>([]);
  const [executive, setExecutive] = useState(user.name);
  const [technician, setTechnician] = useState('');
  const [remarks, setRemarks] = useState('');

  const riders = useQuery({ queryKey: ['riders', 'assigned'], queryFn: listAssignedRiders, enabled: open });
  // Only riders who currently hold a bike — the card is opened against that bike.
  const active = (riders.data ?? []).filter((r) => r.currentVehicleId);
  const rider = active.find((r) => r.id === riderId);
  const existingJobs = useQuery({ queryKey: ['service-jobs', 'list'], queryFn: () => listServiceJobs(), enabled: open });
  const create = useMutation({
    mutationFn: () => createServiceJob({
      vehicleId: rider!.currentVehicleId!, riderId: rider!.id, source,
      damageCategory: 'MINOR', damageNotes: remarks.trim(),
      location: source === 'RSA' ? location.trim() || null : null,
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
    ? existingJobs.data?.find((job) => job.vehicleId === rider?.currentVehicleId && job.status !== 'CLOSED')
    : undefined;
  useEffect(() => {
    if (conflict) void existingJobs.refetch();
  // Fetch the authoritative open card after a concurrent create loses the race.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conflict]);
  const error = create.isError ? create.error.message : riders.isError ? riders.error.message : undefined;
  const errorAction = conflict && openJob ? (
    <Link to={`/service/assistance/${encodeURIComponent(openJob.id)}`} style={{ fontWeight: 700 }}>
      Open job {openJob.id}
    </Link>
  ) : undefined;

  return (
    <JobCardDialog
      open={open}
      title="Open Walk-in / RSA Job Card"
      subtitle="Select an existing active rider. Only unpaid spare-parts balance is added to Weekly Payments."
      helper="List the damaged parts now if you know them. You can add, change or remove them later from the job card."
      error={create.isError ? create.error.message : riders.isError ? riders.error.message : undefined}
      pending={create.isPending}
      ready={Boolean(rider) && Boolean(executive.trim()) && Boolean(remarks.trim()) && linesValid(lines)}
      onSubmit={() => create.mutate()}
      onClose={onClose}
    >
      <ToggleButtonGroup exclusive color="primary" value={source} aria-label="Intake" sx={{ alignSelf: 'start' }}
        onChange={(_, next) => { if (next === 'RSA' || next === 'WALK_IN') setSource(next); }}>
        <ToggleButton value="WALK_IN">Walk-in</ToggleButton>
        <ToggleButton value="RSA">RSA</ToggleButton>
      </ToggleButtonGroup>
      {source === 'RSA' && (
        <TextField label="Roadside location" value={location} onChange={(e) => setLocation(e.target.value)} />
      )}
      <TextField select required label="Active Rider" value={riderId} onChange={(e) => setRiderId(e.target.value)}
        helperText={riders.isPending ? 'Loading riders…' : active.length ? undefined : 'No rider is holding a bike right now.'}
      >
        <MenuItem value="" disabled>Select active rider</MenuItem>
        {active.map((r) => <MenuItem key={r.id} value={r.id}>{r.id} — {r.name}</MenuItem>)}
      </TextField>
      <ReadOnlyField label="Vehicle ID" value={rider?.currentVehicleId ?? ''} placeholder="Auto-filled from active rider" />
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
