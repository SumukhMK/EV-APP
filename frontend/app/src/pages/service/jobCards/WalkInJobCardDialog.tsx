import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../../../app/sessionContext';
import { listAssignedRiders } from '../../../lib/api/riders';
import { createServiceJob } from '../../../lib/api/serviceJobs';
import { invalidateServiceJobs } from '../../../lib/invalidate';
import { REPAIR_TYPE_LABEL, SERVICE_CATEGORY_LABEL } from '../../../lib/serviceJobLabels';
import type { RepairType, ServiceJob } from '../../../types';
import { JobCardDialog, ReadOnlyField } from './JobCardDialog';
import { fullWidth } from './layout';

const REPAIR_TYPES = ['REPAIR_ONLY', 'SPARE_PARTS', 'REPAIR_AND_SPARE_PARTS'] as const;

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
  const [repairType, setRepairType] = useState<RepairType>('REPAIR_ONLY');
  const [executive, setExecutive] = useState(user.name);
  const [technician, setTechnician] = useState('');
  const [remarks, setRemarks] = useState('');

  const riders = useQuery({ queryKey: ['riders', 'assigned'], queryFn: listAssignedRiders, enabled: open });
  // Only riders who currently hold a bike — the card is opened against that bike.
  const active = (riders.data ?? []).filter((r) => r.currentVehicleId);
  const rider = active.find((r) => r.id === riderId);
  const create = useMutation({
    mutationFn: () => createServiceJob({
      vehicleId: rider!.currentVehicleId!, riderId: rider!.id, source,
      damageCategory: 'MINOR', damageNotes: remarks.trim(),
      location: source === 'RSA' ? location.trim() || null : null,
      repairType, createdBy: executive.trim(), technician: technician.trim() || null, actor: user.name,
    }),
    onSuccess: (job) => {
      invalidateServiceJobs(queryClient);
      onCreated(job);
    },
  });

  return (
    <JobCardDialog
      open={open}
      title="Open Walk-in / RSA Job Card"
      subtitle="Select an existing active rider. Only unpaid spare-parts balance is added to Weekly Payments."
      helper={repairType === 'REPAIR_ONLY'
        ? 'Repair-only job card: no spare part is required.'
        : 'Spare parts must be added before the job card is closed.'}
      error={create.isError ? create.error.message : riders.isError ? riders.error.message : undefined}
      pending={create.isPending}
      ready={Boolean(rider) && Boolean(executive.trim()) && Boolean(remarks.trim())}
      onSubmit={() => create.mutate()}
      onClose={onClose}
    >
      <ReadOnlyField label="Service Category" value={SERVICE_CATEGORY_LABEL.WALK_IN_RSA} />
      <TextField select label="Intake" value={source} onChange={(e) => setSource(e.target.value === 'RSA' ? 'RSA' : 'WALK_IN')}>
        <MenuItem value="WALK_IN">Walk-in</MenuItem>
        <MenuItem value="RSA">RSA</MenuItem>
      </TextField>
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
      <ReadOnlyField label="Rider ID" value={rider?.id ?? ''} placeholder="Auto-filled from active rider" />
      <TextField select label="Repair Type" value={repairType} onChange={(e) => setRepairType(e.target.value as RepairType)}>
        {REPAIR_TYPES.map((t) => <MenuItem key={t} value={t}>{REPAIR_TYPE_LABEL[t]}</MenuItem>)}
      </TextField>
      <TextField required label="Ticket Created By (Executive)" value={executive} onChange={(e) => setExecutive(e.target.value)} />
      <TextField label="Ticket Resolved By (Technician)" value={technician} onChange={(e) => setTechnician(e.target.value)}
        placeholder="Enter technician when repair is done" />
      <TextField required multiline minRows={3} sx={fullWidth} label="Initial / Current Remarks"
        placeholder="Vehicle issue, inspection findings or repair notes"
        value={remarks} onChange={(e) => setRemarks(e.target.value)} />
    </JobCardDialog>
  );
}
