import { useState } from 'react';
import AddIcon from '@mui/icons-material/AddOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutlineOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useSession } from '../../app/sessionContext';
import { DefinitionList } from '../../components/DefinitionList';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { RecordSearchSelect } from '../../components/RecordSearchSelect';
import { StateChip } from '../../components/StateChip';
import { closeServiceJob, createServiceJob, getServiceJob } from '../../lib/api/serviceJobs';
import { listInspectableVehicles } from '../../lib/api/vehicles';
import { formatDate, rupeesWithSymbol } from '../../lib/format';
import { invalidateServiceJobs } from '../../lib/invalidate';
import { VEHICLE_STATE_LABEL } from '../../lib/labels';
import { canCloseServiceJob } from '../../lib/roles';
import type { DamageCategory, ServiceJob, ServiceJobSource, ServiceLiability } from '../../types';
import { CATEGORY_LABEL, CATEGORY_TONE, LIABILITY_LABEL, SOURCE_LABEL } from '../../lib/serviceJobLabels';

const deskPath = '/service/assistance';
const columns = { display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 320px' }, gap: 4, mt: 5, alignItems: 'start' };

function useDeskReturn() {
  const { state } = useLocation();
  const target: unknown = state?.returnTo;
  return typeof target === 'string' && (target === deskPath || target.startsWith(`${deskPath}?`)) ? target : deskPath;
}

export function NewAssistanceJob() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const returnTo = useDeskReturn();
  const { user } = useSession();
  const canWork = canCloseServiceJob(user.roleKey);
  const [vehicleId, setVehicleId] = useState('');
  const [source, setSource] = useState<ServiceJobSource>('WALK_IN');
  const [category, setCategory] = useState<DamageCategory>('MINOR');
  const [notes, setNotes] = useState('');
  const vehicles = useQuery({ queryKey: ['vehicles', 'inspectable'], queryFn: listInspectableVehicles, enabled: canWork });
  const picked = vehicles.data?.find((v) => v.id === vehicleId);
  const create = useMutation({
    mutationFn: () => {
      if (!canWork || !picked) throw new Error('Select an available vehicle with an authorised service role.');
      return createServiceJob({ vehicleId: picked.id, riderId: picked.currentRiderId, source, damageCategory: category, damageNotes: notes.trim() || null });
    },
    onSuccess: (job) => {
      invalidateServiceJobs(queryClient);
      navigate(`${deskPath}/${job.id}`, { replace: true, state: { returnTo } });
    },
  });

  return (
    <Box component="form" onSubmit={(e) => { e.preventDefault(); if (!create.isPending) create.mutate(); }}>
      <PageHeader section="Service management / Assistance desk" title="New service job" backTo={returnTo} backLabel="Back to jobs" />
      {!canWork ? <Alert severity="info" sx={{ mt: 4 }}>Your role can view jobs but cannot create them.</Alert> : (
        <Box sx={columns}>
          <Panel label="Request details" subtitle="Log an RSA call, QRT dispatch or walk-in. Deboard jobs arrive automatically.">
            <Box component="fieldset" disabled={create.isPending} sx={{ border: 0, p: 0, m: 0, minWidth: 0, display: 'grid', gap: 4 }}>
              {vehicles.isError && <Alert severity="error" action={<Button color="inherit" onClick={() => void vehicles.refetch()}>Retry</Button>}>{vehicles.error.message}</Alert>}
              <RecordSearchSelect
                label="Vehicle" placeholder="Search by vehicle ID or model" value={vehicleId} onChange={setVehicleId}
                options={(vehicles.data ?? []).map((v) => ({ id: v.id, primary: v.model, secondary: VEHICLE_STATE_LABEL[v.state], trailing: v.currentRiderName ?? v.chassisNumber }))}
                loading={vehicles.isPending}
              />
              <Typography variant="body2" color="text.secondary">Available here: deployed, returned and accident vehicles.</Typography>
              <TextField select label="Request source" value={source} onChange={(e) => {
                const next = e.target.value;
                if (next === 'RSA' || next === 'QRT' || next === 'WALK_IN') setSource(next);
              }}>
                {(['WALK_IN', 'RSA', 'QRT'] as const).map((value) => <MenuItem key={value} value={value}>{SOURCE_LABEL[value]}</MenuItem>)}
              </TextField>
              <TextField select label="Damage category" value={category} onChange={(e) => {
                const next = e.target.value;
                if (next === 'NONE' || next === 'MINOR' || next === 'MAJOR' || next === 'ACCIDENT') setCategory(next);
              }}>
                {(['NONE', 'MINOR', 'MAJOR', 'ACCIDENT'] as const).map((value) => <MenuItem key={value} value={value}>{CATEGORY_LABEL[value]}</MenuItem>)}
              </TextField>
              <TextField label="Reported issue / notes" multiline minRows={4} value={notes} onChange={(e) => setNotes(e.target.value)} helperText="Include affected parts, location and what the team needs to know." />
            </Box>
          </Panel>
          <Panel label="Request summary">
            <DefinitionList items={[
              { label: 'Vehicle', value: picked?.id ?? 'Select a vehicle' },
              { label: 'Rider', value: picked?.currentRiderName ?? 'No assigned rider' },
              { label: 'Source', value: SOURCE_LABEL[source] },
              { label: 'Damage', value: CATEGORY_LABEL[category] },
            ]} />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>Next: record the work and costs on the job page. Creating a job does not post a charge or change vehicle status.</Typography>
            {create.isError && <Alert severity="error" sx={{ mt: 3 }}>{create.error.message}</Alert>}
            <Button type="submit" fullWidth sx={{ mt: 4 }} disabled={!picked || vehicles.isError || create.isPending}>{create.isPending ? 'Creating…' : 'Create job'}</Button>
            <Button component={Link} to={returnTo} color="inherit" fullWidth sx={{ mt: 2 }} disabled={create.isPending}>Cancel</Button>
          </Panel>
        </Box>
      )}
    </Box>
  );
}

export function AssistanceJob() {
  const { jobId = '' } = useParams();
  const returnTo = useDeskReturn();
  const job = useQuery({ queryKey: ['service-jobs', 'detail', jobId], queryFn: () => getServiceJob(jobId), retry: false });
  if (!job.data) return (
    <>
      <PageHeader section="Service management / Assistance desk" title="Service job" backTo={returnTo} backLabel="Back to jobs" />
      {job.isError ? <Alert severity="error" sx={{ mt: 4 }} action={<Button onClick={() => void job.refetch()} color="inherit">Retry</Button>}>{job.error.message}</Alert> : <EmptyState title="Loading job…" />}
    </>
  );
  return <JobRecord key={job.data.id} job={job.data} returnTo={returnTo} />;
}

function JobRecord({ job, returnTo }: { job: ServiceJob; returnTo: string }) {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const editable = canCloseServiceJob(user.roleKey) && job.status !== 'CLOSED';
  const [items, setItems] = useState(() => job.items.length ? job.items.map((item) => ({ label: item.label, cost: (item.costPaise / 100).toFixed(2) })) : [{ label: '', cost: '' }]);
  const [liability, setLiability] = useState<ServiceLiability>(job.liability ?? (job.riderId ? 'RIDER' : 'COMPANY'));
  const [technician, setTechnician] = useState(job.technician ?? '');
  const [confirmed, setConfirmed] = useState(false);
  const priced = items.map((item) => ({ label: item.label.trim(), costPaise: Math.round(Number(item.cost) * 100) }));
  const valid = items.length > 0 && items.every((item, i) => item.label.trim() && /^\d+(\.\d{1,2})?$/.test(item.cost) && Number.isSafeInteger(priced[i].costPaise) && priced[i].costPaise > 0);
  const total = priced.reduce((sum, item) => sum + (Number.isFinite(item.costPaise) && item.costPaise > 0 ? item.costPaise : 0), 0);
  const finalTotal = job.status === 'CLOSED' ? job.totalCostPaise : total;
  const close = useMutation({
    mutationFn: () => {
      if (!editable || !confirmed || !valid || !Number.isSafeInteger(total)) throw new Error('Review every line item and confirm the charges before closing.');
      if (!job.riderId && liability !== 'COMPANY') throw new Error('A rider must be linked before charging a rider or deposit.');
      return closeServiceJob({ jobId: job.id, items: priced, liability, technician: technician.trim() || null });
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['service-jobs', 'detail', job.id], { ...updated });
      invalidateServiceJobs(queryClient);
      setConfirmed(false);
    },
  });
  const updateItem = (index: number, patch: Partial<(typeof items)[number]>) => {
    setItems(items.map((item, i) => i === index ? { ...item, ...patch } : item));
    setConfirmed(false);
  };

  return (
    <>
      <PageHeader section="Service management / Assistance desk" title={job.id} backTo={returnTo} backLabel="Back to jobs"
        actions={<StateChip label={job.status === 'CLOSED' ? 'Closed' : job.status === 'IN_PROGRESS' ? 'In progress' : 'Open'} tone={job.status === 'CLOSED' ? 'good' : 'neutral'} />}
      />
      <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>{SOURCE_LABEL[job.source]} · Opened {formatDate(job.createdOn)}</Typography>
      {close.isSuccess && <Alert severity="success" sx={{ mt: 4 }}>Job closed. The final work and liability are recorded below.</Alert>}
      {!editable && job.status !== 'CLOSED' && <Alert severity="info" sx={{ mt: 4 }}>View-only access. A service or admin role can price and close this job.</Alert>}
      <Box sx={columns}>
        <Box sx={{ display: 'grid', gap: 4, minWidth: 0 }}>
          <Panel label="Reported issue">
            <DefinitionList items={[
              { label: 'Vehicle', value: <Link to={`/vehicles/${job.vehicleId}`}>{job.vehicleId}</Link> },
              { label: 'Rider', value: job.riderId ? <Link to={`/riders/${job.riderId}`}>{job.riderId}</Link> : 'No linked rider' },
              { label: 'Damage', value: <StateChip label={CATEGORY_LABEL[job.damageCategory]} tone={CATEGORY_TONE[job.damageCategory]} /> },
            ]} />
            <Typography sx={{ mt: 3, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{job.damageNotes || 'No notes recorded.'}</Typography>
          </Panel>
          <Panel label="Work and costs" subtitle={editable ? 'Record each part or task separately. All costs are in rupees.' : 'Recorded parts, labour and technician.'}>
            {editable ? (
              <Box component="fieldset" disabled={close.isPending} sx={{ border: 0, p: 0, m: 0, minWidth: 0, display: 'grid', gap: 3 }}>
                {items.map((item, index) => (
                  <Box key={index} sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr) 40px', sm: 'minmax(0, 1fr) 140px 40px' }, gap: 2 }}>
                    <TextField label={`Part / work ${index + 1}`} value={item.label} onChange={(e) => updateItem(index, { label: e.target.value })} sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' } }} />
                    <TextField label={`Cost ${index + 1} (₹)`} value={item.cost} onChange={(e) => updateItem(index, { cost: e.target.value })} slotProps={{ htmlInput: { inputMode: 'decimal' } }}
                      error={Boolean(item.cost) && (!/^\d+(\.\d{1,2})?$/.test(item.cost) || Number(item.cost) <= 0 || !Number.isSafeInteger(priced[index].costPaise))}
                      helperText={item.cost && (!/^\d+(\.\d{1,2})?$/.test(item.cost) || Number(item.cost) <= 0 || !Number.isSafeInteger(priced[index].costPaise)) ? 'Enter a positive cost, up to 2 decimals.' : undefined}
                    />
                    <IconButton aria-label={`Remove line ${index + 1}`} onClick={() => { setItems(items.filter((_, i) => i !== index)); setConfirmed(false); }} sx={{ alignSelf: 'start' }}><DeleteIcon /></IconButton>
                  </Box>
                ))}
                <Button startIcon={<AddIcon />} onClick={() => { setItems([...items, { label: '', cost: '' }]); setConfirmed(false); }} sx={{ justifySelf: 'start' }}>Add line item</Button>
                <TextField label="Technician" value={technician} onChange={(e) => { setTechnician(e.target.value); setConfirmed(false); }} />
              </Box>
            ) : (
              <Box sx={{ display: 'grid', gap: 3 }}>
                {job.items.length ? job.items.map((item, i) => (
                  <Box key={i} sx={{ display: 'flex', gap: 3, justifyContent: 'space-between' }}>
                    <Typography sx={{ overflowWrap: 'anywhere' }}>{item.label}</Typography>
                    <Typography sx={{ whiteSpace: 'nowrap' }}>{rupeesWithSymbol(item.costPaise)}</Typography>
                  </Box>
                )) : <Typography color="text.secondary">No work recorded yet.</Typography>}
                <Typography color="text.secondary">Technician: {job.technician || 'Not recorded'}</Typography>
              </Box>
            )}
          </Panel>
        </Box>
        <Panel label={editable ? 'Review and close' : 'Resolution'}>
          <Typography color="text.secondary" variant="body2">{job.status === 'CLOSED' ? 'Final cost' : 'Total cost'}</Typography>
          <Typography sx={{ fontSize: 28, fontWeight: 600, mt: 1, mb: 3 }}>{rupeesWithSymbol(finalTotal)}</Typography>
          {finalTotal > 500000 && <Alert severity="warning" sx={{ mb: 3 }}>Above ₹5,000. Review the costs and liability carefully.</Alert>}
          {editable ? (
            <>
              <TextField select label="Who pays?" fullWidth value={liability} disabled={close.isPending} onChange={(e) => {
                const next = e.target.value;
                if (next === 'RIDER' || next === 'DEPOSIT' || next === 'COMPANY') { setLiability(next); setConfirmed(false); }
              }}>
                {(['RIDER', 'DEPOSIT', 'COMPANY'] as const).map((value) => <MenuItem key={value} value={value} disabled={!job.riderId && value !== 'COMPANY'}>{LIABILITY_LABEL[value]}</MenuItem>)}
              </TextField>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>
                {!job.riderId ? 'No rider is linked, so this job must be written off to the company.' : liability === 'RIDER' ? 'Closing posts a rider charge to the weekly payment run.' : liability === 'DEPOSIT' ? 'Closing records a deposit-liable charge, separate from weekly billing.' : 'The company covers this cost. No rider charge will be posted.'}
              </Typography>
              {!valid && <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>Add a description and a positive cost for every line before closing.</Typography>}
              <FormControlLabel sx={{ mt: 3, alignItems: 'flex-start' }} control={<Checkbox checked={confirmed} disabled={!valid || close.isPending} onChange={(e) => setConfirmed(e.target.checked)} />} label="I have reviewed the work, costs and liability. Close this job." />
              {close.isError && <Alert severity="error" sx={{ mt: 3 }}>{close.error.message}</Alert>}
              <Button fullWidth sx={{ mt: 3 }} onClick={() => close.mutate()} disabled={!confirmed || !valid || !Number.isSafeInteger(total) || close.isPending}>{close.isPending ? 'Closing…' : 'Close job'}</Button>
            </>
          ) : (
            <DefinitionList items={[
              { label: 'Liability', value: job.liability ? LIABILITY_LABEL[job.liability] : 'Not decided' },
              { label: 'Closed on', value: job.closedOn ? formatDate(job.closedOn) : 'Not closed' },
            ]} />
          )}
        </Panel>
      </Box>
    </>
  );
}
