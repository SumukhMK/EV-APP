import { useEffect, useRef, useState } from 'react';
import AddIcon from '@mui/icons-material/AddOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutlineOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useSession } from '../../app/sessionContext';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DefinitionList } from '../../components/DefinitionList';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { RecordSearchSelect } from '../../components/RecordSearchSelect';
import { StateChip } from '../../components/StateChip';
import { createServiceJob, getServiceJob, listServiceJobs, updateServiceJob } from '../../lib/api/serviceJobs';
import { listInspectableVehicles } from '../../lib/api/inspections';
import { getVehicle } from '../../lib/api/vehicles';
import { formatDateTime, preciseRupeesWithSymbol as rupeesWithSymbol } from '../../lib/format';
import { invalidateServiceJobs } from '../../lib/invalidate';
import { VEHICLE_STATE_LABEL } from '../../lib/labels';
import { canCloseServiceJob, canManageService } from '../../lib/roles';
import { hasServiceNote, isServiceQueue, needsDamageAssessment, QUEUE_STATE, queueForCondition, releaseState } from '../../lib/serviceWorkflow';
import { useShakeValidation, shakeStyles } from '../../hooks/useShakeValidation';
import { HUBS } from '../../mocks/seed';
import { SERVICE_QUEUES, type DamageCategory, type ServiceJob, type ServiceJobItem, type ServiceJobSource, type ServiceLiability, type ServiceQueue } from '../../types';
import { CATEGORY_LABEL, LIABILITY_LABEL, SOURCE_LABEL, SERVICE_QUEUE_LABEL } from '../../lib/serviceJobLabels';

const deskPath = '/service/assistance';
const columns = { display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 340px' }, gap: 4, mt: 4, alignItems: 'start' };
const damageCategories = ['NONE', 'MINOR', 'MAJOR', 'ACCIDENT'] as const;
type Intent = 'STAY' | 'QC' | 'MOVE' | 'QC_FAIL' | 'RELEASE';
type IntentOption = { id: Intent; label: string; hint: string; cta: string; disabled?: boolean };
const requiresReference = (queue: ServiceQueue) => ['WARRANTY', 'INSURANCE', 'PARTS_WAITING'].includes(queue);

/** Mandatory QC safety checks. */
const QC_CHECKS = [
  { id: 'brakes', label: 'Brakes' },
  { id: 'tyres', label: 'Tyres & air' },
  { id: 'battery', label: 'Battery & charging' },
  { id: 'lights', label: 'Lights & indicators' },
  { id: 'horn', label: 'Horn' },
  { id: 'mirrors', label: 'Mirrors' },
  { id: 'throttle', label: 'Throttle & motor' },
  { id: 'frame', label: 'Frame & panels' },
  { id: 'roadtest', label: 'Road test' },
] as const;
type QcCheckId = (typeof QC_CHECKS)[number]['id'];

/** Damage options filtered by source — logical constraints. */
function allowedCategories(source: ServiceJobSource): readonly DamageCategory[] {
  if (source === 'INSPECTION') return ['NONE'];
  if (source === 'RSA' || source === 'QRT') return ['MINOR', 'MAJOR', 'ACCIDENT'];
  return damageCategories; // WALK_IN, DEBOARD, EXCHANGE, REGISTRY
}

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
  const { containerRef: newJobRef, shake: shakeNewJob } = useShakeValidation();
  const vehicles = useQuery({ queryKey: ['vehicles', 'inspectable'], queryFn: listInspectableVehicles, enabled: canWork });
  const jobs = useQuery({ queryKey: ['service-jobs', 'list'], queryFn: () => listServiceJobs(), enabled: canWork });
  const picked = vehicles.data?.find((v) => v.id === vehicleId);
  const existing = jobs.data?.find((j) => j.vehicleId === vehicleId && j.status !== 'CLOSED');
  const create = useMutation({
    mutationFn: () => {
      if (!canWork || !picked || confirmation !== signature || !notes.trim()) throw new Error('Pick the bike, say what is wrong, and tick the confirm box.');
      return createServiceJob({ vehicleId: picked.id, riderId: picked.currentRiderId, source, damageCategory: category, damageNotes: notes.trim(), queue, location: location.trim() || picked.hub, reference, actor: user.name });
    },
    onSuccess: (job) => {
      invalidateServiceJobs(queryClient);
      navigate(`${deskPath}/${job.id}`, { replace: true, state: { returnTo } });
    },
  });
  const newJobReady = Boolean(picked) && !jobs.isPending && !jobs.isError && !vehicles.isError && notes.trim() && (!requiresReference(queue) || reference.trim()) && confirmation === signature;
  return (
    <Box component="form" onSubmit={(e) => { e.preventDefault(); if (!newJobReady) { shakeNewJob(); return; } if (!create.isPending && !existing) create.mutate(); }}>
      <PageHeader section="Service management" title={inspectionMode ? 'Check a bike' : 'Take a bike in for service'} backTo={returnTo} backLabel="Back to jobs" />
      {!canWork ? <Alert severity="info" sx={{ mt: 4 }}>You are not allowed to take bikes in for service.</Alert> : (
        <Box ref={newJobRef} sx={{ ...columns, ...shakeStyles }}>
          <Panel label={inspectionMode ? 'Find or start a check' : 'Bike and problem'} subtitle={inspectionMode ? 'Carry on with the job this bike already has, or take it in for a check. You write what you found and what it costs on the next screen.' : 'Say how the bike reached us and what it needs. That decides which list it goes into.'}>
            <Box component="fieldset" disabled={create.isPending} sx={{ border: 0, p: 0, m: 0, minWidth: 0, display: 'grid', gap: 4 }}>
              {(vehicles.isError || jobs.isError) && <Alert severity="error" action={<Button color="inherit" onClick={() => { void vehicles.refetch(); void jobs.refetch(); }}>Retry</Button>}>{vehicles.error?.message ?? jobs.error?.message}</Alert>}
              <RecordSearchSelect label="Bike" placeholder="Search bike number or model" value={vehicleId} onChange={setVehicleId}
                options={(vehicles.data ?? []).map((v) => ({ id: v.id, primary: v.model, secondary: VEHICLE_STATE_LABEL[v.state], trailing: v.currentRiderName ?? v.hub }))}
                loading={vehicles.isPending}
              />
              {existing ? (
                <Alert severity="info" action={<Button component={Link} to={`${deskPath}/${existing.id}`} state={{ returnTo }}>Open job</Button>}>
                  This bike is already in the list "{SERVICE_QUEUE_LABEL[existing.queue]}". Carry on with job {existing.id} instead of opening a second one.
                </Alert>
              ) : (
                <>
                  <TextField select label="How did the bike reach us?" value={source} onChange={(e) => {
                    const value = e.target.value;
                    if (value === 'RSA' || value === 'QRT' || value === 'WALK_IN' || value === 'INSPECTION') {
                      setSource(value);
                      const allowed = allowedCategories(value);
                      if (!allowed.includes(category)) { setCategory(allowed[0]); setQueue(queueForCondition(allowed[0])); }
                    }
                  }}>
                    {(['WALK_IN', 'RSA', 'QRT', 'INSPECTION'] as const).map((value) => <MenuItem key={value} value={value}>{SOURCE_LABEL[value]}</MenuItem>)}
                  </TextField>
                  {source === 'RSA' || source === 'QRT' ? (
                    <TextField label="Where did it break down?" value={location} onChange={(e) => setLocation(e.target.value)} helperText="Road, landmark or area where the bike stopped." />
                  ) : (
                    <TextField select label="Which hub is it at?" value={location || picked?.hub || ''} onChange={(e) => setLocation(e.target.value)} helperText={picked ? `We filled in ${picked.hub}, the hub on the bike's record. Change it if the bike is somewhere else.` : 'Pick the bike first and we fill in its hub.'}>
                      {HUBS.map((hub) => <MenuItem key={hub} value={hub}>{hub}</MenuItem>)}
                    </TextField>
                  )}
                  <TextField select label="How bad is the damage?" value={category} onChange={(e) => {
                    const value = damageCategories.find((c) => c === e.target.value);
                    if (value) { setCategory(value); setQueue(queueForCondition(value)); }
                  }}>
                    {allowedCategories(source).map((value) => <MenuItem key={value} value={value}>{CATEGORY_LABEL[value]}</MenuItem>)}
                  </TextField>
                  <TextField select label="Which list should it go to?" value={queue} onChange={(e) => { if (isServiceQueue(e.target.value)) setQueue(e.target.value); }}>
                    {SERVICE_QUEUES.filter((q) => q !== 'READY_TO_DEPLOY').map((q) => <MenuItem key={q} value={q}>{SERVICE_QUEUE_LABEL[q]}</MenuItem>)}
                  </TextField>
                  {requiresReference(queue) && <TextField label={queue === 'PARTS_WAITING' ? 'Which parts, and when are they expected?' : 'Claim number or who to follow up with'} value={reference} onChange={(e) => setReference(e.target.value)} required />}
                  <TextField label="What is wrong with the bike?" multiline minRows={3} required value={notes} onChange={(e) => setNotes(e.target.value)} helperText="Write what the rider reported, which parts look affected, and why you picked this list if it is not the obvious one." />
                </>
              )}
            </Box>
          </Panel>
          <Panel label="Check and confirm">
            <DefinitionList items={[
              { label: 'Bike', value: picked?.id ?? 'Pick a bike' },
              { label: 'Rider', value: picked?.currentRiderName ?? 'No rider on this bike' },
              { label: 'Goes to list', value: SERVICE_QUEUE_LABEL[queue] },
              { label: 'Bike will show as', value: VEHICLE_STATE_LABEL[QUEUE_STATE[queue]] },
            ]} />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>
              This moves the bike into the list straight away. The rider keeps the bike on paper, and nothing is charged yet.
              Once the work is done the bike goes back to the same rider, not into the free pool.
            </Typography>
            {!existing && <FormControlLabel sx={{ mt: 3 }} control={<Checkbox disabled={create.isPending} checked={confirmation === signature} onChange={(e) => setConfirmation(e.target.checked ? signature : '')} />} label="Yes, take this bike in and move it." />}
            {create.isError && <Alert severity="error" sx={{ mt: 3 }}>{create.error.message}</Alert>}
            {existing ? <Button component={Link} to={`${deskPath}/${existing.id}`} state={{ returnTo }} fullWidth sx={{ mt: 4 }}>Carry on with the open job</Button> : (
              <Button type="submit" fullWidth sx={{ mt: 4 }} disabled={create.isPending}>{create.isPending ? 'Saving...' : 'Take it in and open the job'}</Button>
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
    <JobRecord key={`${job.data.id}:${job.data.updatedOn}`} job={job.data} returnTo={returnTo} onSaved={(updated) => setSaved(`Saved. The bike is now in "${SERVICE_QUEUE_LABEL[updated.queue]}". Nothing has been charged yet.`)} />
  </>;
}

function JobRecord({ job, returnTo, onSaved }: { job: ServiceJob; returnTo: string; onSaved: (job: ServiceJob) => void }) {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const editable = canManageService(user.roleKey) && job.status !== 'CLOSED';
  const canRelease = canCloseServiceJob(user.roleKey);
  const vehicle = useQuery({ queryKey: ['vehicle', job.vehicleId], queryFn: () => getVehicle(job.vehicleId) });
  const [items, setItems] = useState(() => job.items.map((item) => ({ label: item.label, cost: (item.costPaise / 100).toFixed(2), kind: item.kind ?? 'PART' })));
  const inQC = job.queue === 'QC_PENDING';
  const [qcChecks, setQcChecks] = useState<Record<QcCheckId, boolean>>(() =>
    Object.fromEntries(QC_CHECKS.map((c) => [c.id, false])) as Record<QcCheckId, boolean>,
  );
  const [repairApproved, setRepairApproved] = useState(false);
  const hasRepairWork = Boolean(job.workSummary?.trim());
  const allQcPassed = QC_CHECKS.every((c) => qcChecks[c.id]) && (!hasRepairWork || repairApproved);
  const [intent, setIntent] = useState<Intent>('STAY');
  const prevAllQcPassed = useRef(allQcPassed);
  useEffect(() => {
    if (inQC && allQcPassed && !prevAllQcPassed.current) setIntent('RELEASE');
    prevAllQcPassed.current = allQcPassed;
  }, [allQcPassed, inQC]);
  const [moveQueue, setMoveQueue] = useState<ServiceQueue>(job.queue === 'MINOR_REPAIR' ? 'PARTS_WAITING' : 'MINOR_REPAIR');
  const [category, setCategory] = useState<DamageCategory | ''>(needsDamageAssessment(job) ? '' : job.damageCategory);
  const [findings, setFindings] = useState(job.workSummary);
  const [note, setNote] = useState('');
  const [reference, setReference] = useState(job.reference ?? '');
  const [liability, setLiability] = useState<ServiceLiability>(job.liability ?? (job.riderId ? 'RIDER' : 'COMPANY'));
  const [technician, setTechnician] = useState(job.technician ?? '');
  const [confirmation, setConfirmation] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const failQueue: ServiceQueue = category === 'MAJOR' || category === 'ACCIDENT' ? 'MAJOR_REPAIR' : 'MINOR_REPAIR';
  const queue: ServiceQueue = intent === 'STAY' ? job.queue : intent === 'QC' ? 'QC_PENDING' : intent === 'MOVE' ? moveQueue : intent === 'QC_FAIL' ? failQueue : 'READY_TO_DEPLOY';
  const signature = JSON.stringify({ items, intent, queue, category, findings, note, reference, liability, technician, qcChecks, repairApproved });
  const priced: ServiceJobItem[] = items.map((item) => ({ label: item.label.trim(), costPaise: Math.round(Number(item.cost) * 100), kind: item.kind }));
  const valid = items.every((item, i) => item.label.trim() && /^\d+(\.\d{1,2})?$/.test(item.cost) && Number.isSafeInteger(priced[i].costPaise) && priced[i].costPaise >= 0);
  const total = priced.reduce((sum, item) => sum + (Number.isFinite(item.costPaise) && item.costPaise >= 0 ? item.costPaise : 0), 0);
  const releasing = queue === 'READY_TO_DEPLOY';
  const targetState = releasing ? releaseState(vehicle.data?.currentRiderId ?? null) : QUEUE_STATE[queue];
  const releaseHint = canRelease
    ? 'The bike becomes Ready to Deploy. Any repair cost is finalised and the receipt is generated.'
    : 'Only a service manager or admin can do this.';
  const options: IntentOption[] = inQC ? [
    { id: 'RELEASE', label: 'QC passed — move to Ready to Deploy', hint: allQcPassed ? releaseHint : 'Complete all checks first.', cta: 'Pass QC and release', disabled: !canRelease || !allQcPassed },
    { id: 'QC_FAIL', label: `QC failed — send back for repair`, hint: 'The bike goes back to the repair queue.', cta: `Send back to ${SERVICE_QUEUE_LABEL[failQueue]}` },
    { id: 'STAY', label: 'Save progress', hint: 'The bike stays in Quality Check.', cta: 'Save progress' },
  ] : [
    { id: 'STAY', label: 'Still working on it — save my notes', hint: `The bike stays in ${SERVICE_QUEUE_LABEL[job.queue]}.`, cta: 'Save my notes' },
    { id: 'QC', label: 'Work is done — send it for Quality Check', hint: 'QC is mandatory before the bike can go back on the road.', cta: 'Send for Quality Check' },
    { id: 'MOVE', label: 'Move it to a different list', hint: 'Use this when you are waiting on parts, a warranty or an insurance claim.', cta: `Move to ${SERVICE_QUEUE_LABEL[moveQueue]}` },
  ];
  const chosen = options.find((option) => option.id === intent) ?? options[0];
  // In QC mode, auto-fill findings and technician from the checklist instead of free text.
  const qcFindings = inQC
    ? `QC checklist: ${QC_CHECKS.filter((c) => qcChecks[c.id]).map((c) => c.label).join(', ')}${hasRepairWork && repairApproved ? '. Repair approved.' : ''}`
    : '';
  const effectiveFindings = inQC ? (qcFindings || findings) : findings;
  const effectiveTechnician = inQC ? (user.name || technician) : technician;
  const save = useMutation({
    mutationFn: () => {
      if (!editable || !category || confirmation !== signature || !valid || (!inQC && !hasServiceNote(note))) throw new Error('Fill in the details and tick the confirm box.');
      if (releasing && !canRelease) throw new Error('Only a service manager or admin can release the bike.');
      if (releasing && inQC && !allQcPassed) throw new Error('Complete all QC checks before releasing.');
      const effectiveNote = note.trim() || (inQC ? 'QC completed' : '');
      return updateServiceJob({
        jobId: job.id, queue, damageCategory: category, workSummary: effectiveFindings, items: priced,
        technician: effectiveTechnician.trim() || null, liability: canRelease ? liability : job.liability, reference: reference.trim() || null, note: effectiveNote,
        actor: user.name,
        inspection: { vehicleId: job.vehicleId, category, notes: effectiveFindings || note, items: priced, technician: effectiveTechnician.trim() || null, estimatedCostPaise: total, nextState: targetState },
      });
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['service-jobs', 'detail', job.id], { ...updated });
      onSaved(updated);
      invalidateServiceJobs(queryClient);
    },
  });
  const patchItem = (index: number, patch: Partial<(typeof items)[number]>) => setItems(items.map((item, i) => i === index ? { ...item, ...patch } : item));

  const { containerRef: formRef, shake: shakeField } = useShakeValidation();
  const blocker = !category ? 'Pick how bad the damage is.'
    : !valid ? 'Fix the cost lines.'
    : !inQC && (releasing || queue === 'QC_PENDING') && !findings.trim() ? 'Write what you found.'
    : !inQC && (releasing || queue === 'QC_PENDING') && !technician.trim() ? 'Say who did the work.'
    : inQC && releasing && !allQcPassed ? 'Complete all QC checks.'
    : requiresReference(queue) && !reference.trim() ? 'Add the parts or claim details.'
    : !inQC && !hasServiceNote(note) ? 'Write a note.'
    : releasing && !canRelease ? 'Only a service manager or admin can release.'
    : confirmation !== signature ? 'Tick the confirm box.'
    : '';
  const ready = Boolean(category) && valid && Number.isSafeInteger(total) && (inQC || hasServiceNote(note)) && confirmation === signature &&
    (!requiresReference(queue) || reference.trim()) &&
    (!inQC && (!(releasing || queue === 'QC_PENDING') || (technician.trim() && findings.trim())) || inQC) &&
    (!releasing || canRelease) &&
    (!(releasing && inQC) || allQcPassed);

  return (
    <>
      <PageHeader section="Service management / Job" title={`${job.vehicleId} · ${job.id}`} backTo={returnTo} backLabel="Back to jobs"
        actions={<StateChip label={job.status === 'CLOSED' ? 'Finished' : SERVICE_QUEUE_LABEL[job.queue]} tone={job.status === 'CLOSED' ? 'good' : 'neutral'} />}
      />
      <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>Came in as: {SOURCE_LABEL[job.source]} · {formatDateTime(job.createdOn)}</Typography>
      {job.status === 'CLOSED' && <Alert severity="success" sx={{ mt: 3 }}>This job is finished. The bike went back out and the charge, if any, was added once.</Alert>}
      <Box ref={formRef} sx={{ ...columns, ...shakeStyles }}>
        <Box sx={{ display: 'grid', gap: 4, minWidth: 0 }}>
          <Panel label="What was reported">
            <DefinitionList items={[
              { label: 'Bike', value: <Link to={`/vehicles/${job.vehicleId}`}>{job.vehicleId}</Link> },
              { label: 'Rider', value: job.riderId ? <Link to={`/riders/${job.riderId}`}>{job.riderId}</Link> : 'No rider on this bike' },
              { label: 'Bike shows as', value: vehicle.data ? VEHICLE_STATE_LABEL[vehicle.data.state] : 'Loading…' },
              { label: 'Where it is', value: job.location ?? vehicle.data?.hub ?? 'Not noted' },
            ]} />
            {vehicle.isError && <Alert severity="error">{vehicle.error.message}</Alert>}
            <Typography sx={{ mt: 3, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{job.damageNotes || 'Nothing was written down when the bike came in.'}</Typography>
            {job.source === 'REGISTRY' && !job.items.length && <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>This is an older record, so the cost breakdown is missing. Check the work before sending the bike out. Nothing is charged automatically.</Typography>}
            {editable && vehicle.data?.currentRiderId && <Box sx={{ mt: 3 }}>
              <Typography variant="body2" color="text.secondary">The rider still has this bike on their name. Give them a different bike, or end the assignment.</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 2 }}>
                <Button component={Link} to={`/assignments/exchange?riderId=${vehicle.data.currentRiderId}`}>Give another bike</Button>
                <Button component={Link} to={`/assignments/deboard?riderId=${vehicle.data.currentRiderId}`} color="inherit">End assignment</Button>
              </Box>
            </Box>}
          </Panel>
          {inQC && editable ? (
            /* ── QC checklist mode ── */
            <Panel label="Quality Check" subtitle="Inspect every item. Tick each one.">
              {/* Check all / uncheck all — left on mobile, right from sm up */}
              <Box sx={{ display: 'flex', justifyContent: { xs: 'flex-start', sm: 'flex-end' }, mb: 1 }}>
                {QC_CHECKS.every((c) => qcChecks[c.id])
                  ? <Button size="small" color="inherit" onClick={() => setQcChecks(Object.fromEntries(QC_CHECKS.map((c) => [c.id, false])) as Record<QcCheckId, boolean>)}>Uncheck all</Button>
                  : <Button size="small" onClick={() => setQcChecks(Object.fromEntries(QC_CHECKS.map((c) => [c.id, true])) as Record<QcCheckId, boolean>)}>Check all</Button>
                }
              </Box>
              {/* Safety checklist — single column */}
              <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1 }}>
                {QC_CHECKS.map((check) => (
                  <FormControlLabel
                    key={check.id}
                    sx={{
                      border: 1, borderColor: qcChecks[check.id] ? 'success.main' : 'divider',
                      borderRadius: 1.5, m: 0, px: 1.5, py: 1, minWidth: 0,
                      bgcolor: qcChecks[check.id] ? 'success.main' : 'transparent',
                      '& .MuiTypography-root': { color: qcChecks[check.id] ? 'success.contrastText' : 'text.primary', minWidth: 0 },
                      transition: 'all 0.15s',
                    }}
                    control={<Checkbox size="small" checked={qcChecks[check.id]} onChange={(e) => setQcChecks({ ...qcChecks, [check.id]: e.target.checked })} sx={{ color: qcChecks[check.id] ? 'success.contrastText' : undefined, '&.Mui-checked': { color: 'success.contrastText' } }} />}
                    label={<Typography variant="body2" sx={{ fontSize: 13 }}>{check.label}</Typography>}
                  />
                ))}
              </Box>

              {/* Repair verification tile — below the grid */}
              {hasRepairWork ? (
                <Box sx={{ border: 1, borderColor: repairApproved ? 'success.main' : 'divider', borderRadius: 2, p: 2.5, mt: 2.5, transition: 'border-color 0.15s' }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>Repair done</Typography>
                  <Typography variant="body2" sx={{ mt: 1, whiteSpace: 'pre-wrap' }}>{job.workSummary}</Typography>
                  {job.items.length > 0 && (
                    <Box sx={{ mt: 1.5 }}>
                      {job.items.map((item, i) => (
                        <Typography key={i} variant="body2" color="text.secondary">{item.label} — {rupeesWithSymbol(item.costPaise)}</Typography>
                      ))}
                      <Typography variant="body2" sx={{ fontWeight: 600, mt: 1 }}>Total: {rupeesWithSymbol(job.totalCostPaise)}</Typography>
                    </Box>
                  )}
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>By: {job.technician || 'Not noted'}</Typography>
                  <FormControlLabel
                    sx={{ mt: 1.5 }}
                    control={<Checkbox checked={repairApproved} onChange={(e) => setRepairApproved(e.target.checked)} />}
                    label={<Typography variant="body2">Repair verified and approved</Typography>}
                  />
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>No repair — routine check only.</Typography>
              )}

              {allQcPassed ? (
                <Alert severity="success" sx={{ mt: 2 }}>All checks passed. Ready to release.</Alert>
              ) : (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
                  {QC_CHECKS.filter((c) => !qcChecks[c.id]).length} check{QC_CHECKS.filter((c) => !qcChecks[c.id]).length !== 1 ? 's' : ''} remaining{hasRepairWork && !repairApproved ? ' + repair approval' : ''}
                </Typography>
              )}
            </Panel>
          ) : (
            /* ── Repair / closed mode ── */
            <Panel label="What you found, and what it costs" subtitle={editable ? 'Write it down as you go. When the work is done, send the bike for Quality Check.' : undefined}>
              {editable ? (
                <Box component="fieldset" disabled={save.isPending} sx={{ border: 0, p: 0, m: 0, minWidth: 0, display: 'grid', gap: 3 }}>
                  <TextField select label="How bad is the damage?" value={category} helperText={!category ? 'Nobody has noted this yet. Look at the bike and pick one before saving.' : undefined} onChange={(e) => { const next = damageCategories.find((c) => c === e.target.value); if (next) setCategory(next); }}>
                    {damageCategories.map((c) => <MenuItem key={c} value={c}>{CATEGORY_LABEL[c]}</MenuItem>)}
                  </TextField>
                  <TextField label="What did you find, and what did you do?" multiline minRows={3} value={findings} onChange={(e) => setFindings(e.target.value)} helperText="Which parts, what was wrong, what you fixed." />
                  <TextField label="Who did the work?" value={technician} onChange={(e) => setTechnician(e.target.value)} helperText="Needed before the bike can go for QC." />
                  {items.map((item, index) => (
                    <Box key={index} sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr) 40px', sm: '100px minmax(0, 1fr) 110px 40px' }, gap: 2 }}>
                      <TextField select label="Type" value={item.kind} onChange={(e) => { const kind = e.target.value; if (kind === 'PART' || kind === 'LABOUR' || kind === 'OTHER') patchItem(index, { kind }); }} sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' } }}>
                        <MenuItem value="PART">Part</MenuItem><MenuItem value="LABOUR">Labour</MenuItem><MenuItem value="OTHER">Something else</MenuItem>
                      </TextField>
                      <TextField label={`Item ${index + 1}`} value={item.label} onChange={(e) => patchItem(index, { label: e.target.value })} sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' } }} />
                      <TextField label={`Cost ${index + 1} (₹)`} value={item.cost} onChange={(e) => patchItem(index, { cost: e.target.value })} slotProps={{ htmlInput: { inputMode: 'decimal' } }} error={Boolean(item.cost) && (!/^\d+(\.\d{1,2})?$/.test(item.cost) || Number(item.cost) < 0)} />
                      <IconButton aria-label={`Remove line ${index + 1}`} onClick={() => setItems(items.filter((_, i) => i !== index))} sx={{ alignSelf: 'start' }}><DeleteIcon /></IconButton>
                    </Box>
                  ))}
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
                    <Button startIcon={<AddIcon />} onClick={() => setItems([...items, { label: '', cost: '', kind: 'PART' }])}>Add a cost line</Button>
                    {items.length > 0 && <Typography variant="body2" sx={{ fontWeight: 600 }}>Total: {rupeesWithSymbol(total)}</Typography>}
                  </Box>
                  {!items.length && <Typography color="text.secondary" variant="body2">Nothing to charge. Write what you found.</Typography>}
                </Box>
              ) : (
                <Box sx={{ display: 'grid', gap: 3 }}>
                  <Typography sx={{ whiteSpace: 'pre-wrap' }}>{job.workSummary || 'Nothing written down yet.'}</Typography>
                  {job.items.map((item, i) => <Box key={i} sx={{ display: 'flex', gap: 3, justifyContent: 'space-between' }}><Typography>{item.kind ?? 'Part'} · {item.label}</Typography><Typography>{rupeesWithSymbol(item.costPaise)}</Typography></Box>)}
                  <Typography color="text.secondary">Done by: {job.technician || 'Not noted'}</Typography>
                </Box>
              )}
            </Panel>
          )}
          <Panel label="What happened so far">
            {job.activity.length === 0 ? <Typography color="text.secondary">Nothing has been added yet. What we already knew is shown above.</Typography> : [...job.activity].reverse().map((event, i) => (
              <Box key={i} sx={{ py: 3, borderBottom: 1, borderColor: 'divider' }}>
                <Typography variant="body2">{SERVICE_QUEUE_LABEL[event.queue]} · {VEHICLE_STATE_LABEL[event.vehicleState]}</Typography>
                <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', mt: 1 }}>{event.note}</Typography>
                <Typography variant="caption" color="text.secondary">{event.actor} · {formatDateTime(event.occurredOn)}</Typography>
              </Box>
            ))}
            {job.inspections.map((inspection, i) => (
              <Box key={i} sx={{ pt: 3 }}>
                <Typography variant="body2">Check {i + 1} · {CATEGORY_LABEL[inspection.category]} · {inspection.technician || inspection.actor}</Typography>
                <Typography variant="body2" color="text.secondary">{inspection.notes}</Typography>
                {inspection.items.map((item, n) => <Typography key={n} variant="body2">{item.label}: {rupeesWithSymbol(item.costPaise)}</Typography>)}
              </Box>
            ))}
          </Panel>
        </Box>
        <Panel label={editable ? 'What happens next' : 'How it ended'}>
          <Typography color="text.secondary" variant="body2">{job.status === 'CLOSED' ? 'Final cost' : 'Cost so far'}</Typography>
          <Typography sx={{ fontSize: 28, fontWeight: 600, mt: 1, mb: 3 }}>{rupeesWithSymbol(job.status === 'CLOSED' ? job.totalCostPaise : total)}</Typography>
          {total > 500000 && <Alert severity="warning" sx={{ mb: 3 }}>This is over ₹5,000. Check the amounts and who pays before the bike goes back out.</Alert>}
          {editable ? (
            <Box sx={{ display: 'grid', gap: 3 }}>
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>What do you want to do?</Typography>
                <Typography variant="caption" color="text.secondary">Pick one. The button at the bottom does exactly what you pick.</Typography>
                <RadioGroup value={intent} onChange={(e) => { setIntent(e.target.value as Intent); setConfirmation(''); }} sx={{ mt: 1 }}>
                  {options.map((option) => (
                    <FormControlLabel key={option.id} value={option.id} disabled={option.disabled || save.isPending} control={<Radio size="small" />} sx={{ alignItems: 'flex-start', mb: 1, '& .MuiRadio-root': { pt: 0 } }}
                      label={<Box sx={{ pt: '2px' }}><Typography variant="body2">{option.label}</Typography><Typography variant="caption" color="text.secondary">{option.hint}</Typography></Box>} />
                  ))}
                </RadioGroup>
              </Box>
              {intent === 'MOVE' && (
                <TextField select label="Which list?" value={moveQueue} onChange={(e) => { if (isServiceQueue(e.target.value)) setMoveQueue(e.target.value); }}>
                  {SERVICE_QUEUES.filter((q) => q !== 'READY_TO_DEPLOY' && q !== 'QC_PENDING').map((q) => <MenuItem key={q} value={q}>{SERVICE_QUEUE_LABEL[q]}</MenuItem>)}
                </TextField>
              )}
              <Typography variant="body2">After you save, the bike will show as <strong>{VEHICLE_STATE_LABEL[targetState]}</strong> and sit in <strong>{releasing ? 'no list — it is out of service management' : SERVICE_QUEUE_LABEL[queue]}</strong>.</Typography>
              {requiresReference(queue) && <TextField label={queue === 'PARTS_WAITING' ? 'Which parts, and when are they expected?' : 'Claim number or who to follow up with'} value={reference} onChange={(e) => setReference(e.target.value)} required />}
              {canRelease ? (
                <TextField select label="Who pays?" value={liability} onChange={(e) => { const next = e.target.value; if (next === 'RIDER' || next === 'DEPOSIT' || next === 'COMPANY') setLiability(next); }}>
                  {(['RIDER', 'DEPOSIT', 'COMPANY'] as const).map((value) => <MenuItem key={value} value={value} disabled={!job.riderId && value !== 'COMPANY'}>{LIABILITY_LABEL[value]}</MenuItem>)}
                </TextField>
              ) : <Alert severity="info">You can write down what you found and move the bike between lists. A service manager or admin decides who pays and sends the bike back out.</Alert>}
              <Typography variant="body2" color="text.secondary">{job.riderId ? 'The rider is charged only when the bike finally goes back out, not when you save or send it for QC.' : 'No rider on this bike, so the company covers the cost.'}</Typography>
              <TextField label={inQC ? 'Notes (optional)' : intent === 'STAY' ? 'What did you do just now?' : 'Why are you making this change?'} required={!inQC} multiline minRows={2} value={note} onChange={(e) => setNote(e.target.value)} helperText={inQC ? 'Anything extra you noticed. Leave blank if nothing.' : 'A line or two.'} />
              {!valid && <Alert severity="warning">Every line needs a short description and an amount of ₹0 or more, up to two decimals.</Alert>}
              <FormControlLabel control={<Checkbox checked={confirmation === signature} onChange={(e) => setConfirmation(e.target.checked ? signature : '')} />} label={releasing ? 'I approve this work, the cost, and sending the bike back out.' : 'I confirm these details and where the bike is going.'} />
              {save.isError && <Alert severity="error">{save.error.message}</Alert>}
              <Button onClick={() => { if (!ready) { shakeField(); return; } if (releasing) { setConfirmOpen(true); return; } save.mutate(); }} disabled={save.isPending || vehicle.isPending || vehicle.isError}>{save.isPending ? 'Saving...' : chosen.cta}</Button>
              {blocker && <Typography variant="caption" color="text.secondary" sx={{ mt: -2 }}>{blocker}</Typography>}
            </Box>
          ) : <DefinitionList items={[
            { label: 'Who paid', value: job.liability ? LIABILITY_LABEL[job.liability] : 'Nobody was charged' },
            { label: 'Finished on', value: job.closedOn ? formatDateTime(job.closedOn) : 'Not finished yet' },
            { label: 'Claim / parts note', value: job.reference ?? 'None' },
          ]} />}
        </Panel>
      </Box>
      <ConfirmDialog
        open={confirmOpen}
        title="Release the bike?"
        message="The bike leaves service management and the rider is charged."
        info={`${job.riderId ? `Rider ${job.riderId} is charged ${rupeesWithSymbol(total)}${liability === 'DEPOSIT' ? ' from their deposit' : liability === 'COMPANY' ? ' — the company covers it' : ''}.` : 'No rider on this bike — the company covers the cost.'} The bike moves to ${VEHICLE_STATE_LABEL[targetState]}.`}
        confirmLabel={chosen.cta}
        tone="bad"
        dismissible={false}
        pending={save.isPending}
        onConfirm={() => { setConfirmOpen(false); save.mutate(); }}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
