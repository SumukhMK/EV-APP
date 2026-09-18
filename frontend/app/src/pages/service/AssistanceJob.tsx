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
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useSession } from '../../app/sessionContext';
import { DefinitionList } from '../../components/DefinitionList';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { RecordSearchSelect } from '../../components/RecordSearchSelect';
import { StateChip } from '../../components/StateChip';
import { createServiceJob, getServiceJob, listServiceJobs, updateServiceJob } from '../../lib/api/serviceJobs';
import { getVehicle, listInspectableVehicles } from '../../lib/api/vehicles';
import { formatDateTime, preciseRupeesWithSymbol as rupeesWithSymbol } from '../../lib/format';
import { invalidateServiceJobs } from '../../lib/invalidate';
import { VEHICLE_STATE_LABEL } from '../../lib/labels';
import { canCloseServiceJob, canManageService } from '../../lib/roles';
import { hasServiceNote, isServiceQueue, needsDamageAssessment, QUEUE_STATE, queueForCondition, releaseState } from '../../lib/serviceWorkflow';
import { SERVICE_QUEUES, type DamageCategory, type ServiceJob, type ServiceJobItem, type ServiceJobSource, type ServiceLiability, type ServiceQueue } from '../../types';
import { CATEGORY_LABEL, LIABILITY_LABEL, SOURCE_LABEL, SERVICE_QUEUE_LABEL } from '../../lib/serviceJobLabels';

const deskPath = '/service/assistance';
const columns = { display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 340px' }, gap: 4, mt: 4, alignItems: 'start' };
const damageCategories = ['NONE', 'MINOR', 'MAJOR', 'ACCIDENT'] as const;
const requiresReference = (queue: ServiceQueue) => ['WARRANTY', 'INSURANCE', 'PARTS_WAITING'].includes(queue);

function useDeskReturn() {
  const { state } = useLocation();
  const target: unknown = state?.returnTo;
  return typeof target === 'string' && ['/service/assistance', '/service/queues', '/service/qc'].some((path) => target === path || target.startsWith(`${path}?`)) ? target : '/service/queues';
}

export function NewAssistanceJob({ inspectionMode = false }: { inspectionMode?: boolean }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const returnTo = useDeskReturn();
  const [params] = useSearchParams();
  const { user } = useSession();
  const canWork = canManageService(user.roleKey);
  const [vehicleId, setVehicleId] = useState(params.get('vehicle') ?? '');
  const [source, setSource] = useState<ServiceJobSource>(inspectionMode || params.get('source') === 'INSPECTION' ? 'INSPECTION' : 'WALK_IN');
  const [category, setCategory] = useState<DamageCategory>('MINOR');
  const [queue, setQueue] = useState<ServiceQueue>(inspectionMode ? 'ASSESSMENT' : 'MINOR_REPAIR');
  const [notes, setNotes] = useState('');
  const [location, setLocation] = useState('');
  const [reference, setReference] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const signature = JSON.stringify({ vehicleId, source, category, queue, notes, location, reference });
  const vehicles = useQuery({ queryKey: ['vehicles', 'inspectable'], queryFn: listInspectableVehicles, enabled: canWork });
  const jobs = useQuery({ queryKey: ['service-jobs', 'list'], queryFn: () => listServiceJobs(), enabled: canWork });
  const picked = vehicles.data?.find((v) => v.id === vehicleId);
  const existing = jobs.data?.find((j) => j.vehicleId === vehicleId && j.status !== 'CLOSED');
  const create = useMutation({
    mutationFn: () => {
      if (!canWork || !picked || confirmation !== signature || !notes.trim()) throw new Error('Select the vehicle, record the issue and confirm its destination.');
      return createServiceJob({ vehicleId: picked.id, riderId: picked.currentRiderId, source, damageCategory: category, damageNotes: notes.trim(), queue, location: location.trim() || picked.hub, reference, actor: user.name });
    },
    onSuccess: (job) => {
      invalidateServiceJobs(queryClient);
      navigate(`${deskPath}/${job.id}`, { replace: true, state: { returnTo } });
    },
  });
  return (
    <Box component="form" onSubmit={(e) => { e.preventDefault(); if (!create.isPending && !existing) create.mutate(); }}>
      <PageHeader section="Service management" title={inspectionMode ? 'Inspect vehicle' : 'Receive vehicle / service request'} backTo={returnTo} backLabel="Back to jobs" />
      {!canWork ? <Alert severity="info" sx={{ mt: 4 }}>Your role cannot receive service requests.</Alert> : (
        <Box sx={columns}>
          <Panel label={inspectionMode ? 'Find or start an assessment' : 'Intake details'} subtitle={inspectionMode ? 'Continue the existing service record, or receive this vehicle for assessment. Findings and costs are recorded on the work record.' : 'The source is how it arrived. The service category determines where the vehicle goes.'}>
            <Box component="fieldset" disabled={create.isPending} sx={{ border: 0, p: 0, m: 0, minWidth: 0, display: 'grid', gap: 4 }}>
              {(vehicles.isError || jobs.isError) && <Alert severity="error" action={<Button color="inherit" onClick={() => { void vehicles.refetch(); void jobs.refetch(); }}>Retry</Button>}>{vehicles.error?.message ?? jobs.error?.message}</Alert>}
              <RecordSearchSelect label="Vehicle" placeholder="Search vehicle ID or model" value={vehicleId} onChange={setVehicleId}
                options={(vehicles.data ?? []).map((v) => ({ id: v.id, primary: v.model, secondary: VEHICLE_STATE_LABEL[v.state], trailing: v.currentRiderName ?? v.hub }))}
                loading={vehicles.isPending}
              />
              {existing ? (
                <Alert severity="info" action={<Button component={Link} to={`${deskPath}/${existing.id}`} state={{ returnTo }}>Open job</Button>}>
                  Already in {SERVICE_QUEUE_LABEL[existing.queue]}. Continue {existing.id} instead of creating a duplicate.
                </Alert>
              ) : (
                <>
                  <TextField select label="Request source" value={source} onChange={(e) => {
                    const value = e.target.value;
                    if (value === 'RSA' || value === 'QRT' || value === 'WALK_IN' || value === 'INSPECTION') setSource(value);
                  }}>
                    {(['WALK_IN', 'RSA', 'QRT', 'INSPECTION'] as const).map((value) => <MenuItem key={value} value={value}>{SOURCE_LABEL[value]}</MenuItem>)}
                  </TextField>
                  <TextField label={source === 'RSA' || source === 'QRT' ? 'Pickup / breakdown location' : 'Hub / service location'} value={location} onChange={(e) => setLocation(e.target.value)} helperText={`Defaults to ${picked?.hub ?? 'the vehicle hub'}.`} />
                  <TextField select label="Damage severity" value={category} onChange={(e) => {
                    const value = damageCategories.find((c) => c === e.target.value);
                    if (value) { setCategory(value); setQueue(queueForCondition(value)); }
                  }}>
                    {damageCategories.map((value) => <MenuItem key={value} value={value}>{CATEGORY_LABEL[value]}</MenuItem>)}
                  </TextField>
                  <TextField select label="Send to service category" value={queue} onChange={(e) => { if (isServiceQueue(e.target.value)) setQueue(e.target.value); }}>
                    {SERVICE_QUEUES.filter((q) => q !== 'READY_TO_DEPLOY').map((q) => <MenuItem key={q} value={q}>{SERVICE_QUEUE_LABEL[q]}</MenuItem>)}
                  </TextField>
                  {requiresReference(queue) && <TextField label={queue === 'PARTS_WAITING' ? 'Parts awaited / ETA' : 'Claim or warranty reference / follow-up'} value={reference} onChange={(e) => setReference(e.target.value)} required />}
                  <TextField label="Reported issue / affected parts" multiline minRows={3} required value={notes} onChange={(e) => setNotes(e.target.value)} helperText="Record symptoms, affected parts and any reason for overriding the suggested category." />
                </>
              )}
            </Box>
          </Panel>
          <Panel label="Confirm intake">
            <DefinitionList items={[
              { label: 'Vehicle', value: picked?.id ?? 'Select a vehicle' },
              { label: 'Rider', value: picked?.currentRiderName ?? 'No assigned rider' },
              { label: 'Service category', value: SERVICE_QUEUE_LABEL[queue] },
              { label: 'Vehicle state after intake', value: VEHICLE_STATE_LABEL[QUEUE_STATE[queue]] },
            ]} />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>
              Intake moves the vehicle immediately, without deboarding the rider or posting a charge.
              An existing assignment stays linked; after service the vehicle returns to that rider, not the available fleet.
            </Typography>
            {!existing && <FormControlLabel sx={{ mt: 3 }} control={<Checkbox disabled={create.isPending} checked={confirmation === signature} onChange={(e) => setConfirmation(e.target.checked ? signature : '')} />} label="Confirm this intake and vehicle movement." />}
            {create.isError && <Alert severity="error" sx={{ mt: 3 }}>{create.error.message}</Alert>}
            {existing ? <Button component={Link} to={`${deskPath}/${existing.id}`} state={{ returnTo }} fullWidth sx={{ mt: 4 }}>Continue existing job</Button> : (
              <Button type="submit" fullWidth sx={{ mt: 4 }} disabled={!picked || jobs.isPending || jobs.isError || vehicles.isError || !notes.trim() || (requiresReference(queue) && !reference.trim()) || confirmation !== signature || create.isPending}>{create.isPending ? 'Receiving…' : 'Receive and open job'}</Button>
            )}
          </Panel>
        </Box>
      )}
    </Box>
  );
}

export function AssistanceJob() {
  const { jobId = '' } = useParams();
  const returnTo = useDeskReturn();
  const [saved, setSaved] = useState('');
  const job = useQuery({ queryKey: ['service-jobs', 'detail', jobId], queryFn: () => getServiceJob(jobId), retry: false });
  if (!job.data) return (
    <>
      <PageHeader section="Service management" title="Service job" backTo={returnTo} backLabel="Back to jobs" />
      {job.isError ? <Alert severity="error" sx={{ mt: 4 }} action={<Button onClick={() => void job.refetch()} color="inherit">Retry</Button>}>{job.error.message}</Alert> : <EmptyState title="Loading job…" />}
    </>
  );
  return <>
    {saved && job.data.status !== 'CLOSED' && <Alert severity="success" sx={{ mb: 3 }}>{saved}</Alert>}
    <JobRecord key={`${job.data.id}:${job.data.updatedOn}`} job={job.data} returnTo={returnTo} onSaved={(updated) => setSaved(`Progress saved. Current queue: ${SERVICE_QUEUE_LABEL[updated.queue]}. No charge has been posted.`)} />
  </>;
}

function JobRecord({ job, returnTo, onSaved }: { job: ServiceJob; returnTo: string; onSaved: (job: ServiceJob) => void }) {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const editable = canManageService(user.roleKey) && job.status !== 'CLOSED';
  const canRelease = canCloseServiceJob(user.roleKey);
  const vehicle = useQuery({ queryKey: ['vehicle', job.vehicleId], queryFn: () => getVehicle(job.vehicleId) });
  const [items, setItems] = useState(() => job.items.map((item) => ({ label: item.label, cost: (item.costPaise / 100).toFixed(2), kind: item.kind ?? 'PART' })));
  const [queue, setQueue] = useState(job.queue);
  const [category, setCategory] = useState<DamageCategory | ''>(needsDamageAssessment(job) ? '' : job.damageCategory);
  const [findings, setFindings] = useState(job.workSummary);
  const [note, setNote] = useState('');
  const [reference, setReference] = useState(job.reference ?? '');
  const [liability, setLiability] = useState<ServiceLiability>(job.liability ?? (job.riderId ? 'RIDER' : 'COMPANY'));
  const [technician, setTechnician] = useState(job.technician ?? '');
  const [confirmation, setConfirmation] = useState('');
  const signature = JSON.stringify({ items, queue, category, findings, note, reference, liability, technician });
  const priced: ServiceJobItem[] = items.map((item) => ({ label: item.label.trim(), costPaise: Math.round(Number(item.cost) * 100), kind: item.kind }));
  const valid = items.every((item, i) => item.label.trim() && /^\d+(\.\d{1,2})?$/.test(item.cost) && Number.isSafeInteger(priced[i].costPaise) && priced[i].costPaise >= 0);
  const total = priced.reduce((sum, item) => sum + (Number.isFinite(item.costPaise) && item.costPaise >= 0 ? item.costPaise : 0), 0);
  const releasing = queue === 'READY_TO_DEPLOY';
  const moving = queue !== job.queue;
  const targetState = releasing ? releaseState(vehicle.data?.currentRiderId ?? null) : QUEUE_STATE[queue];
  const save = useMutation({
    mutationFn: () => {
      if (!editable || !category || confirmation !== signature || !valid || !hasServiceNote(note)) throw new Error('Complete the severity, findings, costs and confirmation before saving.');
      if (releasing && !canRelease) throw new Error('A service manager or admin must approve release and charges.');
      return updateServiceJob({
        jobId: job.id, queue, damageCategory: category, workSummary: findings, items: priced,
        technician: technician.trim() || null, liability: canRelease ? liability : job.liability, reference: reference.trim() || null, note,
        actor: user.name,
        inspection: { vehicleId: job.vehicleId, category, notes: findings || note, items: priced, technician: technician.trim() || null, estimatedCostPaise: total, nextState: targetState },
      });
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['service-jobs', 'detail', job.id], { ...updated });
      onSaved(updated);
      invalidateServiceJobs(queryClient);
    },
  });
  const patchItem = (index: number, patch: Partial<(typeof items)[number]>) => setItems(items.map((item, i) => i === index ? { ...item, ...patch } : item));
  const ready = Boolean(category) && valid && Number.isSafeInteger(total) && hasServiceNote(note) && confirmation === signature &&
    (!requiresReference(queue) || reference.trim()) &&
    (!(releasing || queue === 'QC_PENDING') || (technician.trim() && findings.trim())) &&
    (!releasing || canRelease);

  return (
    <>
      <PageHeader section="Service management / Work record" title={`${job.vehicleId} · ${job.id}`} backTo={returnTo} backLabel="Back to jobs"
        actions={<StateChip label={job.status === 'CLOSED' ? 'Closed' : SERVICE_QUEUE_LABEL[job.queue]} tone={job.status === 'CLOSED' ? 'good' : 'neutral'} />}
      />
      <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>{SOURCE_LABEL[job.source]} · Received {formatDateTime(job.createdOn)}</Typography>
      {job.status === 'CLOSED' && <Alert severity="success" sx={{ mt: 3 }}>Job closed. The vehicle was released and any applicable charge was posted once.</Alert>}
      <Box sx={columns}>
        <Box sx={{ display: 'grid', gap: 4, minWidth: 0 }}>
          <Panel label="Reported issue">
            <DefinitionList items={[
              { label: 'Vehicle', value: <Link to={`/vehicles/${job.vehicleId}`}>{job.vehicleId}</Link> },
              { label: 'Linked rider', value: job.riderId ? <Link to={`/riders/${job.riderId}`}>{job.riderId}</Link> : 'No linked rider' },
              { label: 'Vehicle state', value: vehicle.data ? VEHICLE_STATE_LABEL[vehicle.data.state] : 'Loading…' },
              { label: 'Location', value: job.location ?? vehicle.data?.hub ?? 'Not recorded' },
            ]} />
            {vehicle.isError && <Alert severity="error">{vehicle.error.message}</Alert>}
            <Typography sx={{ mt: 3, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{job.damageNotes || 'No intake notes recorded.'}</Typography>
            {job.source === 'REGISTRY' && !job.items.length && <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>Migrated record: itemised costs were not recorded. Review the work before release; no charge is inferred.</Typography>}
            {editable && vehicle.data?.currentRiderId && <Box sx={{ mt: 3 }}>
              <Typography variant="body2" color="text.secondary">The rider still holds this bike. Exchange it for a replacement, or deboard to end the assignment.</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 2 }}>
                <Button component={Link} to={`/assignments/exchange?riderId=${vehicle.data.currentRiderId}`}>Exchange bike</Button>
                <Button component={Link} to={`/assignments/deboard?riderId=${vehicle.data.currentRiderId}`} color="inherit">Deboard rider</Button>
              </Box>
            </Box>}
          </Panel>
          <Panel label="Inspection, work and costs" subtitle="Record findings here. Save progress at any time; send finished work to QC before release.">
            {editable ? (
              <Box component="fieldset" disabled={save.isPending} sx={{ border: 0, p: 0, m: 0, minWidth: 0, display: 'grid', gap: 3 }}>
                <TextField select label="Damage severity" value={category} helperText={!category ? 'Severity was not recorded. Assess the vehicle and select a result before saving.' : undefined} onChange={(e) => { const next = damageCategories.find((c) => c === e.target.value); if (next) setCategory(next); }}>
                  {damageCategories.map((c) => <MenuItem key={c} value={c}>{CATEGORY_LABEL[c]}</MenuItem>)}
                </TextField>
                <TextField label="Inspection findings / work done" multiline minRows={3} value={findings} onChange={(e) => setFindings(e.target.value)} helperText="Record affected parts, diagnosis, work completed and the no-work result if no repair is needed." />
                <TextField label="Technician / inspector" value={technician} onChange={(e) => setTechnician(e.target.value)} helperText="Findings and technician are required when sending to QC or releasing." />
                {items.map((item, index) => (
                  <Box key={index} sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr) 40px', sm: '100px minmax(0, 1fr) 110px 40px' }, gap: 2 }}>
                    <TextField select label="Type" value={item.kind} onChange={(e) => { const kind = e.target.value; if (kind === 'PART' || kind === 'LABOUR' || kind === 'OTHER') patchItem(index, { kind }); }} sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' } }}>
                      <MenuItem value="PART">Part</MenuItem><MenuItem value="LABOUR">Labour</MenuItem><MenuItem value="OTHER">Other</MenuItem>
                    </TextField>
                    <TextField label={`Part / work ${index + 1}`} value={item.label} onChange={(e) => patchItem(index, { label: e.target.value })} sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' } }} />
                    <TextField label={`Cost ${index + 1} (₹)`} value={item.cost} onChange={(e) => patchItem(index, { cost: e.target.value })} slotProps={{ htmlInput: { inputMode: 'decimal' } }} error={Boolean(item.cost) && (!/^\d+(\.\d{1,2})?$/.test(item.cost) || Number(item.cost) < 0)} />
                    <IconButton aria-label={`Remove line ${index + 1}`} onClick={() => setItems(items.filter((_, i) => i !== index))} sx={{ alignSelf: 'start' }}><DeleteIcon /></IconButton>
                  </Box>
                ))}
                <Button startIcon={<AddIcon />} onClick={() => setItems([...items, { label: '', cost: '', kind: 'PART' }])} sx={{ justifySelf: 'start' }}>Add part / labour</Button>
                {!items.length && <Typography color="text.secondary" variant="body2">No billable work. A no-cost inspection or QC release is allowed; record the findings.</Typography>}
              </Box>
            ) : (
              <Box component="fieldset" disabled={save.isPending} sx={{ border: 0, p: 0, m: 0, minWidth: 0, display: 'grid', gap: 3 }}>
                <Typography sx={{ whiteSpace: 'pre-wrap' }}>{job.workSummary || 'No findings recorded.'}</Typography>
                {job.items.map((item, i) => <Box key={i} sx={{ display: 'flex', gap: 3, justifyContent: 'space-between' }}><Typography>{item.kind ?? 'Part'} · {item.label}</Typography><Typography>{rupeesWithSymbol(item.costPaise)}</Typography></Box>)}
                <Typography color="text.secondary">Technician: {job.technician || 'Not recorded'}</Typography>
              </Box>
            )}
          </Panel>
          <Panel label="Movement and work history">
            {job.activity.length === 0 ? <Typography color="text.secondary">No recorded updates yet. Existing registry details are shown above.</Typography> : [...job.activity].reverse().map((event, i) => (
              <Box key={i} sx={{ py: 3, borderBottom: 1, borderColor: 'divider' }}>
                <Typography variant="body2">{SERVICE_QUEUE_LABEL[event.queue]} · {VEHICLE_STATE_LABEL[event.vehicleState]}</Typography>
                <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', mt: 1 }}>{event.note}</Typography>
                <Typography variant="caption" color="text.secondary">{event.actor} · {formatDateTime(event.occurredOn)}</Typography>
              </Box>
            ))}
            {job.inspections.map((inspection, i) => (
              <Box key={i} sx={{ pt: 3 }}>
                <Typography variant="body2">Inspection {i + 1} · {CATEGORY_LABEL[inspection.category]} · {inspection.technician || inspection.actor}</Typography>
                <Typography variant="body2" color="text.secondary">{inspection.notes}</Typography>
                {inspection.items.map((item, n) => <Typography key={n} variant="body2">{item.label}: {rupeesWithSymbol(item.costPaise)}</Typography>)}
              </Box>
            ))}
          </Panel>
        </Box>
        <Panel label={editable ? 'Next action' : 'Resolution'}>
          <Typography color="text.secondary" variant="body2">{job.status === 'CLOSED' ? 'Final cost' : 'Work total'}</Typography>
          <Typography sx={{ fontSize: 28, fontWeight: 600, mt: 1, mb: 3 }}>{rupeesWithSymbol(job.status === 'CLOSED' ? job.totalCostPaise : total)}</Typography>
          {total > 500000 && <Alert severity="warning" sx={{ mb: 3 }}>Above ₹5,000. Review costs and liability before release.</Alert>}
          {editable ? (
            <Box sx={{ display: 'grid', gap: 3 }}>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                {job.queue === 'QC_PENDING' ? (
                  <><Button onClick={() => { setQueue('READY_TO_DEPLOY'); setNote(''); }} disabled={!canRelease || save.isPending}>Pass QC</Button><Button color="inherit" onClick={() => { setQueue(category === 'MAJOR' || category === 'ACCIDENT' ? 'MAJOR_REPAIR' : 'MINOR_REPAIR'); setNote(''); }}>Fail QC</Button></>
                ) : <Button onClick={() => setQueue('QC_PENDING')}>Send to QC</Button>}
              </Box>
              <TextField select label="Next service category / outcome" value={queue} onChange={(e) => { if (isServiceQueue(e.target.value)) setQueue(e.target.value); }}>
                {SERVICE_QUEUES.map((q) => <MenuItem key={q} value={q} disabled={q === 'READY_TO_DEPLOY' && !canRelease}>{q === 'READY_TO_DEPLOY' ? vehicle.data?.currentRiderId ? 'Release to current rider' : 'Ready to deploy (RTD)' : SERVICE_QUEUE_LABEL[q]}</MenuItem>)}
              </TextField>
              <Typography variant="body2">Vehicle will be <strong>{VEHICLE_STATE_LABEL[targetState]}</strong>.</Typography>
              {requiresReference(queue) && <TextField label={queue === 'PARTS_WAITING' ? 'Parts awaited / ETA' : 'Claim or warranty reference / follow-up'} value={reference} onChange={(e) => setReference(e.target.value)} required />}
              {canRelease ? (
                <TextField select label="Who pays?" value={liability} onChange={(e) => { const next = e.target.value; if (next === 'RIDER' || next === 'DEPOSIT' || next === 'COMPANY') setLiability(next); }}>
                  {(['RIDER', 'DEPOSIT', 'COMPANY'] as const).map((value) => <MenuItem key={value} value={value} disabled={!job.riderId && value !== 'COMPANY'}>{LIABILITY_LABEL[value]}</MenuItem>)}
                </TextField>
              ) : <Alert severity="info">Fleet staff can record findings and move queues. A service manager or admin approves liability and final release.</Alert>}
              <Typography variant="body2" color="text.secondary">{job.riderId ? 'Charges post once on final release, not when saving progress or sending to QC.' : 'No linked rider: costs are company-liable.'}</Typography>
              <TextField label={job.queue === 'QC_PENDING' ? 'QC findings / movement reason' : 'Update / movement reason'} required multiline minRows={2} value={note} onChange={(e) => setNote(e.target.value)} helperText="Explain this action. For parts/claims, record what is awaited; for release, record the checks passed." />
              {releasing && job.queue !== 'QC_PENDING' && <Alert severity="warning">This releases without a separate QC step. Record the checks and why QC is being bypassed.</Alert>}
              {!valid && <Alert severity="warning">Complete each work description and enter a non-negative cost, up to two decimals.</Alert>}
              <FormControlLabel control={<Checkbox checked={confirmation === signature} onChange={(e) => setConfirmation(e.target.checked ? signature : '')} />} label={releasing ? 'I approve these findings, costs and final release.' : 'I confirm these details and the selected destination.'} />
              {save.isError && <Alert severity="error">{save.error.message}</Alert>}
              <Button onClick={() => save.mutate()} disabled={!ready || save.isPending || vehicle.isPending || vehicle.isError}>{save.isPending ? 'Saving…' : releasing ? 'Confirm release & close' : moving ? `Move to ${SERVICE_QUEUE_LABEL[queue]}` : 'Save progress'}</Button>
            </Box>
          ) : <DefinitionList items={[
            { label: 'Liability', value: job.liability ? LIABILITY_LABEL[job.liability] : 'No charge' },
            { label: 'Closed on', value: job.closedOn ? formatDateTime(job.closedOn) : 'Not closed' },
            { label: 'Reference', value: job.reference ?? 'Not applicable' },
          ]} />}
        </Panel>
      </Box>
    </>
  );
}
