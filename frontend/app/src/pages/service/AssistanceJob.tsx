import { useState } from 'react';
import AddIcon from '@mui/icons-material/AddOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutlineOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
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
import { Locked, Panel } from '../../components/Panel';
import { RecordSearchSelect } from '../../components/RecordSearchSelect';
import { StateChip } from '../../components/StateChip';
import { createServiceJob, getServiceJob, listServiceJobs, updateServiceJob } from '../../lib/api/serviceJobs';
import { listInspectableVehicles } from '../../lib/api/inspections';
import { getVehicle } from '../../lib/api/vehicles';
import { formatDateTime, preciseRupeesWithSymbol as rupeesWithSymbol } from '../../lib/format';
import { invalidateServiceJobs } from '../../lib/invalidate';
import { VEHICLE_STATE_LABEL } from '../../lib/labels';
import { canCloseServiceJob, canManageService } from '../../lib/roles';
import { isServiceQueue, JOB_STAGE_LABEL, JOB_STAGE_TONE, jobStage, needsDamageAssessment, QUEUE_STATE, queueForCondition, releaseState, walkInRiderCharge } from '../../lib/serviceWorkflow';
import { useShakeValidation, shakeStyles } from '../../hooks/useShakeValidation';
import { HUBS } from '../../mocks/seed';
import { SERVICE_QUEUES, type DamageCategory, type ServiceJob, type ServiceJobItem, type ServiceJobSource, type ServiceLiability, type ServiceQueue } from '../../types';
import { CATEGORY_LABEL, LIABILITY_LABEL, REPAIR_TYPE_LABEL, SERVICE_CATEGORY_LABEL, SOURCE_LABEL, SERVICE_QUEUE_LABEL } from '../../lib/serviceJobLabels';

const deskPath = '/service/assistance';
const columns = { display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 340px' }, gap: 4, mt: 4, alignItems: 'start' };
const damageCategories = ['NONE', 'MINOR', 'MAJOR', 'ACCIDENT'] as const;
type Intent = 'QC' | 'MOVE' | 'QC_FAIL' | 'RELEASE';
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
  // A routine check offers one damage level, "No damage" — see
  // allowedCategories — so it opens on that and on the QC queue it leads
  // to. It used to open on "Small damage", a value its own picker did not
  // list, and the summary promised the repair list until the operator
  // re-picked the only option there was.
  const inspection = inspectionMode || params.get('source') === 'INSPECTION';
  const [category, setCategory] = useState<DamageCategory>(inspection ? 'NONE' : 'MINOR');
  const [queue, setQueue] = useState<ServiceQueue>(inspection ? 'QC_PENDING' : 'MINOR_REPAIR');
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
                <Locked locked={!vehicleId && 'Pick the bike first'} sx={{ display: 'grid', gap: 4 }}>
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
                </Locked>
              )}
            </Box>
          </Panel>
          <Panel label="Check and confirm" locked={!vehicleId && 'Pick the bike first'}>
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
    <JobRecord key={`${job.data.id}:${job.data.updatedOn}`} job={job.data} returnTo={returnTo} onSaved={(updated) => setSaved(`Saved. The job is now ${JOB_STAGE_LABEL[jobStage(updated)]}. Nothing has been charged yet.`)} />
  </>;
}

/** Which pop-up is open: record the work and send it to QC, move it to another list, or run the QC itself. */
type JobDialog = 'QC' | 'MOVE' | 'QC_RUN';

function JobRecord({ job, returnTo, onSaved }: { job: ServiceJob; returnTo: string; onSaved: (job: ServiceJob) => void }) {
  // Exchange and deboard, reached from here, come back here when done.
  const { pathname: herePath } = useLocation();
  const { user } = useSession();
  const queryClient = useQueryClient();
  const editable = canManageService(user.roleKey) && job.status !== 'CLOSED';
  const canRelease = canCloseServiceJob(user.roleKey);
  const vehicle = useQuery({ queryKey: ['vehicle', job.vehicleId], queryFn: () => getVehicle(job.vehicleId) });
  const [items, setItems] = useState(() => job.items.map((item) => ({ label: item.label, cost: (item.costPaise / 100).toFixed(2), kind: item.kind ?? 'PART' })));
  const inQC = job.queue === 'QC_PENDING';
  const noChecks = () => Object.fromEntries(QC_CHECKS.map((c) => [c.id, false])) as Record<QcCheckId, boolean>;
  const [qcChecks, setQcChecks] = useState<Record<QcCheckId, boolean>>(noChecks);
  const [repairApproved, setRepairApproved] = useState(false);
  const hasRepairWork = Boolean(job.workSummary?.trim());
  const checksDone = QC_CHECKS.every((c) => qcChecks[c.id]) && (!hasRepairWork || repairApproved);
  const [dialog, setDialog] = useState<JobDialog | null>(null);
  const [moveQueue, setMoveQueue] = useState<ServiceQueue>(job.queue === 'MINOR_REPAIR' ? 'PARTS_WAITING' : 'MINOR_REPAIR');
  const [category, setCategory] = useState<DamageCategory | ''>(needsDamageAssessment(job) ? '' : job.damageCategory);
  const [findings, setFindings] = useState(job.workSummary);
  const [note, setNote] = useState('');
  const [reference, setReference] = useState(job.reference ?? '');
  const [liability, setLiability] = useState<ServiceLiability>(job.liability ?? (job.riderId ? 'RIDER' : 'COMPANY'));
  const [technician, setTechnician] = useState(job.technician ?? '');
  // A walk-in or RSA card is a counter transaction: the rider pays for parts
  // there and then, and only what is left over reaches their weekly payment.
  const walkIn = job.category === 'WALK_IN_RSA';
  const [partsPaid, setPartsPaid] = useState(((job.partsPaidPaise ?? 0) / 100).toFixed(2));
  // Where the server sends a failed bike (ServiceJobService.reworkQueueFor):
  // its damage category's repair bench, or — for a bike that arrived
  // undamaged and still failed — assessment, since nobody has said what is wrong yet.
  const failQueue: ServiceQueue = category === 'MAJOR' || category === 'ACCIDENT' ? 'MAJOR_REPAIR' : category === 'MINOR' ? 'MINOR_REPAIR' : 'ASSESSMENT';
  const queueFor = (intent: Intent): ServiceQueue => intent === 'QC' ? 'QC_PENDING' : intent === 'MOVE' ? moveQueue : intent === 'QC_FAIL' ? failQueue : 'READY_TO_DEPLOY';
  const priced: ServiceJobItem[] = items.map((item) => ({ label: item.label.trim(), costPaise: Math.round(Number(item.cost) * 100), kind: item.kind }));
  const valid = items.every((item, i) => item.label.trim() && /^\d+(\.\d{1,2})?$/.test(item.cost) && Number.isSafeInteger(priced[i].costPaise) && priced[i].costPaise >= 0);
  const total = priced.reduce((sum, item) => sum + (Number.isFinite(item.costPaise) && item.costPaise >= 0 ? item.costPaise : 0), 0);
  const partsTotal = priced.reduce((sum, item) => sum + (item.kind === 'PART' && item.costPaise >= 0 ? item.costPaise : 0), 0);
  const partsPaidPaise = Math.round(Number(partsPaid) * 100);
  const partsPaidValid = !walkIn || (/^\d+(\.\d{1,2})?$/.test(partsPaid) && Number.isSafeInteger(partsPaidPaise) && partsPaidPaise <= partsTotal);
  const riderCharge = walkInRiderCharge(priced, partsPaidValid ? partsPaidPaise : 0);
  // Spare parts have to exist before a card opened for them can be closed.
  const partsMissing = job.repairType !== 'REPAIR_ONLY' && !priced.some((item) => item.kind === 'PART');
  const releaseState_ = releaseState(vehicle.data?.currentRiderId ?? null);
  const qcFindings = `QC checklist: ${QC_CHECKS.filter((c) => qcChecks[c.id]).map((c) => c.label).join(', ')}${hasRepairWork && repairApproved ? '. Repair approved.' : ''}`;
  // The QC inspector is whoever is signed in; the job's technician stays the person who did the repair.
  const inspector = inQC ? (user.name || technician) : technician;

  const save = useMutation({
    mutationFn: (intent: Intent) => {
      const queue = queueFor(intent);
      const releasing = queue === 'READY_TO_DEPLOY';
      if (!editable || !category || !valid) throw new Error('Fill in the details first.');
      if (releasing && !canRelease) throw new Error('Only fleet and admin roles can release the bike.');
      if (releasing && !checksDone) throw new Error('Complete all QC checks before releasing.');
      const workSummary = inQC ? qcFindings : findings;
      const fallbackNote = intent === 'QC' ? 'Work done, sent for Quality Check'
        : intent === 'MOVE' ? `Moved to ${SERVICE_QUEUE_LABEL[queue]}`
        : intent === 'QC_FAIL' ? 'QC failed' : 'QC completed';
      return updateServiceJob({
        jobId: job.id, queue, damageCategory: category, workSummary, items: priced,
        technician: technician.trim() || null, liability: canRelease ? liability : job.liability, reference: reference.trim() || null, note: note.trim() || fallbackNote,
        actor: user.name,
        partsPaidPaise: walkIn ? partsPaidPaise : undefined,
        inspection: { vehicleId: job.vehicleId, category, notes: workSummary || note, items: priced, technician: inspector.trim() || null, estimatedCostPaise: total, nextState: releasing ? releaseState_ : QUEUE_STATE[queue] },
        // Only in QC does the screen have anything to feed /service/jobs/{id}/qc.
        qcChecks: inQC ? qcChecks : undefined,
      });
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['service-jobs', 'detail', job.id], { ...updated });
      onSaved(updated);
      invalidateServiceJobs(queryClient);
    },
  });
  const patchItem = (index: number, patch: Partial<(typeof items)[number]>) => setItems(items.map((item, i) => i === index ? { ...item, ...patch } : item));
  const { containerRef: dialogRef, shake } = useShakeValidation();

  /** Why a pop-up's main button cannot go yet; empty when it can. The button shakes instead of greying out. */
  const blockerFor = (intent: Intent) => {
    const queue = queueFor(intent);
    const releasing = queue === 'READY_TO_DEPLOY';
    return !category ? 'Pick how bad the damage is.'
      : !valid ? 'Every cost line needs a description and an amount of ₹0 or more.'
      : intent === 'QC' && !findings.trim() ? 'Write what you found.'
      : intent === 'QC' && !technician.trim() ? 'Say who did the work.'
      : requiresReference(queue) && !reference.trim() ? 'Add the parts or claim details.'
      : releasing && !vehicle.data ? 'Still loading the bike — try again in a moment.'
      : releasing && !checksDone ? 'Tick every check first.'
      : releasing && partsMissing ? 'This job card is for spare parts. Add at least one part line before closing it.'
      : releasing && !partsPaidValid ? 'Spare parts paid must be ₹0 or more, and no more than the spare parts total.'
      : '';
  };
  const submit = (intent: Intent) => {
    if (blockerFor(intent)) { shake(); return; }
    save.mutate(intent);
  };
  const close = () => { if (!save.isPending) { setDialog(null); save.reset(); } };
  const ctaFor: Record<Intent, string> = {
    QC: 'Send for Quality Check',
    MOVE: `Move to ${SERVICE_QUEUE_LABEL[moveQueue]}`,
    QC_FAIL: `Fail — send back to ${SERVICE_QUEUE_LABEL[failQueue]}`,
    RELEASE: 'Pass QC and release',
  };
  const dialogIntent: Intent = dialog === 'MOVE' ? 'MOVE' : dialog === 'QC_RUN' ? 'RELEASE' : 'QC';
  const blocker = dialog ? blockerFor(dialogIntent) : '';
  const damagePicker = (
    <TextField select label="How bad is the damage?" value={category} helperText={!category ? 'Nobody has noted this yet. Look at the bike and pick one.' : undefined}
      onChange={(e) => { const next = damageCategories.find((c) => c === e.target.value); if (next) setCategory(next); }}>
      {damageCategories.map((c) => <MenuItem key={c} value={c}>{CATEGORY_LABEL[c]}</MenuItem>)}
    </TextField>
  );
  const noteField = <TextField label="Note (optional)" multiline minRows={2} value={note} onChange={(e) => setNote(e.target.value)} />;
  const allChecked = QC_CHECKS.every((c) => qcChecks[c.id]) && (!hasRepairWork || repairApproved);
  const setAllChecks = (on: boolean) => {
    setQcChecks(Object.fromEntries(QC_CHECKS.map((c) => [c.id, on])) as Record<QcCheckId, boolean>);
    setRepairApproved(on);
  };
  const chargeLine = job.riderId
    ? `Rider ${job.riderId} is charged ${rupeesWithSymbol(liability === 'COMPANY' ? 0 : walkIn ? riderCharge : total)}${liability === 'DEPOSIT' ? ' from their deposit' : liability === 'COMPANY' ? ' — the company covers it' : walkIn ? ' in Weekly Payments' : ''}.`
    : 'No rider on this bike, so the company covers the cost.';

  return (
    <>
      <PageHeader section="Service management / Job" title={`${job.vehicleId} · ${job.id}`} backTo={returnTo} backLabel="Back to jobs"
        actions={<Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
          {/* One status, in the same words the boards use. */}
          <StateChip label={JOB_STAGE_LABEL[jobStage(job)]} tone={JOB_STAGE_TONE[jobStage(job)]} />
        </Box>}
      />
      <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>Came in as: {SOURCE_LABEL[job.source]} · {formatDateTime(job.createdOn)}</Typography>
      {job.status === 'CLOSED' && <Alert severity="success" sx={{ mt: 3 }}>This job is finished. The bike went back out and the charge, if any, was added once.</Alert>}
      <Box sx={columns}>
        <Box sx={{ display: 'grid', gap: 4, minWidth: 0 }}>
          <Panel label="What was reported">
            <DefinitionList items={[
              { label: 'Bike', value: <Link to={`/vehicles/${job.vehicleId}`}>{job.vehicleId}</Link> },
              { label: 'Rider', value: job.riderId ? <Link to={`/riders/${job.riderId}`}>{job.riderName ? `${job.riderName} · ${job.riderId}` : job.riderId}</Link> : 'No rider on this bike' },
              { label: 'Bike shows as', value: vehicle.data ? VEHICLE_STATE_LABEL[vehicle.data.state] : 'Loading…' },
              { label: 'Where it is', value: job.location ?? vehicle.data?.hub ?? 'Not noted' },
              { label: 'Category', value: SERVICE_CATEGORY_LABEL[job.category] },
              { label: 'Repair type', value: REPAIR_TYPE_LABEL[job.repairType] },
              { label: 'Ticket created by', value: job.createdBy || job.activity[0]?.actor || 'Not noted' },
            ]} />
            {vehicle.isError && <Alert severity="error">{vehicle.error.message}</Alert>}
            <Typography sx={{ mt: 3, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{job.damageNotes || 'Nothing was written down when the bike came in.'}</Typography>
            {job.source === 'REGISTRY' && !job.items.length && <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>This is an older record, so the cost breakdown is missing. Check the work before sending the bike out. Nothing is charged automatically.</Typography>}
            {editable && vehicle.data?.currentRiderId && <Box sx={{ mt: 3 }}>
              <Typography variant="body2" color="text.secondary">The rider still has this bike on their name. Give them a different bike, or end the assignment.</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 2 }}>
                <Button component={Link} to={`/assignments/exchange?riderId=${vehicle.data.currentRiderId}`} state={{ returnTo: herePath }}>Give another bike</Button>
                <Button component={Link} to={`/assignments/deboard?riderId=${vehicle.data.currentRiderId}`} state={{ returnTo: herePath }} color="inherit">End assignment</Button>
              </Box>
            </Box>}
          </Panel>
          <Panel label="What you found, and what it costs">
            <Box sx={{ display: 'grid', gap: 3 }}>
              <Typography sx={{ whiteSpace: 'pre-wrap' }}>{job.workSummary || 'Nothing written down yet.'}</Typography>
              {job.items.map((item, i) => <Box key={i} sx={{ display: 'flex', gap: 3, justifyContent: 'space-between' }}><Typography>{item.kind ?? 'Part'} · {item.label}</Typography><Typography>{rupeesWithSymbol(item.costPaise)}</Typography></Box>)}
              <Typography color="text.secondary">Done by: {job.technician || 'Not noted'}</Typography>
            </Box>
          </Panel>
          <Panel label="What happened so far">
            {job.activity.length === 0 ? <Typography color="text.secondary">Nothing has been added yet. What we already knew is shown above.</Typography> : [...job.activity].reverse().map((event, i) => (
              <Box key={i} sx={{ py: 3, borderBottom: 1, borderColor: 'divider' }}>
                <Typography variant="body2">{JOB_STAGE_LABEL[jobStage({ queue: event.queue, status: 'IN_PROGRESS' })]}</Typography>
                <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', mt: 1 }}>{event.note}</Typography>
                <Typography variant="caption" color="text.secondary">{event.actor} · {formatDateTime(event.occurredOn)}</Typography>
              </Box>
            ))}
            {job.inspections.map((inspection, i) => (
              <Box key={i} sx={{ pt: 3 }}>
                <Typography variant="body2">Check {i + 1} · {CATEGORY_LABEL[inspection.category]} · {inspection.technician || inspection.actor}</Typography>
                <Typography variant="body2" color="text.secondary">{inspection.notes}</Typography>
                {(inspection.items ?? []).map((item, n) => <Typography key={n} variant="body2">{item.label}: {rupeesWithSymbol(item.costPaise)}</Typography>)}
              </Box>
            ))}
            {job.qcInspections?.map((inspection, i) => (
              <Box key={`qc-${i}`} sx={{ pt: 3 }}>
                <Typography variant="body2">QC {i + 1} · {inspection.passed ? 'Passed' : 'Failed'} · {inspection.inspector}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {Object.entries(inspection.checks).filter(([, ok]) => !ok).map(([id]) => id).join(', ') || 'All checks passed'}
                </Typography>
                {inspection.notes && <Typography variant="body2" color="text.secondary">{inspection.notes}</Typography>}
                <Typography variant="caption" color="text.secondary">{formatDateTime(inspection.inspectedOn)}</Typography>
              </Box>
            ))}
          </Panel>
        </Box>
        <Panel label={editable ? 'What happens next' : 'How it ended'}>
          <Typography color="text.secondary" variant="body2">{job.status === 'CLOSED' ? 'Final cost' : 'Cost so far'}</Typography>
          <Typography sx={{ fontSize: 28, fontWeight: 600, mt: 1, mb: 3 }}>{rupeesWithSymbol(job.totalCostPaise)}</Typography>
          {editable ? (
            <Box sx={{ display: 'grid', gap: 2 }}>
              {inQC ? (
                <Button variant="contained" onClick={() => setDialog('QC_RUN')}>Do the Quality Check</Button>
              ) : <>
                <Button variant="contained" onClick={() => setDialog('QC')}>Work done — send for Quality Check</Button>
                <Button onClick={() => setDialog('MOVE')}>Waiting on parts or a claim</Button>
              </>}
              <Typography variant="body2" color="text.secondary">{job.riderId ? 'The rider is charged only when the bike goes back out.' : 'No rider on this bike, so the company covers the cost.'}</Typography>
            </Box>
          ) : <DefinitionList items={[
            { label: 'Who paid', value: job.liability ? LIABILITY_LABEL[job.liability] : 'Nobody was charged' },
            { label: 'Finished on', value: job.closedOn ? formatDateTime(job.closedOn) : 'Not finished yet' },
            { label: 'Claim / parts note', value: job.reference ?? 'None' },
          ]} />}
        </Panel>
      </Box>

      <Dialog open={dialog !== null} onClose={close} fullWidth maxWidth="sm">
        <DialogTitle>{dialog === 'QC' ? 'Send for Quality Check' : dialog === 'MOVE' ? 'Move to another list' : 'Quality Check'}</DialogTitle>
        <DialogContent>
          <Box ref={dialogRef} component="fieldset" disabled={save.isPending} sx={{ border: 0, p: 0, pt: 1.5, m: 0, minWidth: 0, display: 'grid', gap: 3, ...shakeStyles }}>
            {dialog === 'QC' && <>
              {damagePicker}
              <TextField label="What did you find, and what did you do?" multiline minRows={3} value={findings} onChange={(e) => setFindings(e.target.value)} required />
              <TextField label="Ticket Resolved By (Technician)" value={technician} onChange={(e) => setTechnician(e.target.value)} required />
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
              {total > 500000 && <Alert severity="warning">This is over ₹5,000. Check the amounts before the bike goes to QC.</Alert>}
              {noteField}
            </>}

            {dialog === 'MOVE' && <>
              <TextField select label="Which list?" value={moveQueue} onChange={(e) => { if (isServiceQueue(e.target.value)) setMoveQueue(e.target.value); }}>
                {SERVICE_QUEUES.filter((q) => q !== 'READY_TO_DEPLOY' && q !== 'QC_PENDING').map((q) => <MenuItem key={q} value={q}>{SERVICE_QUEUE_LABEL[q]}</MenuItem>)}
              </TextField>
              {requiresReference(moveQueue) && <TextField label={moveQueue === 'PARTS_WAITING' ? 'Which parts, and when are they expected?' : 'Claim number or who to follow up with'} value={reference} onChange={(e) => setReference(e.target.value)} required />}
              {!category && damagePicker}
              {noteField}
            </>}

            {dialog === 'QC_RUN' && <>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2" color="text.secondary">Inspect every item. Tick each one.</Typography>
                <Button size="small" color={allChecked ? 'inherit' : 'primary'} onClick={() => setAllChecks(!allChecked)}>{allChecked ? 'Uncheck all' : 'Check all'}</Button>
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1, mt: -1 }}>
                {QC_CHECKS.map((check) => (
                  <FormControlLabel key={check.id} sx={{ border: 1, borderColor: qcChecks[check.id] ? 'success.main' : 'divider', borderRadius: 1.5, m: 0, px: 1, minWidth: 0 }}
                    control={<Checkbox size="small" checked={qcChecks[check.id]} onChange={(e) => setQcChecks({ ...qcChecks, [check.id]: e.target.checked })} />}
                    label={<Typography variant="body2">{check.label}</Typography>} />
                ))}
              </Box>
              {hasRepairWork ? (
                <Box sx={{ border: 1, borderColor: repairApproved ? 'success.main' : 'divider', borderRadius: 2, p: 2 }}>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{job.workSummary}</Typography>
                  <Typography variant="caption" color="text.secondary">By: {job.technician || 'Not noted'}</Typography>
                  <FormControlLabel sx={{ display: 'flex', mt: 1 }} control={<Checkbox checked={repairApproved} onChange={(e) => setRepairApproved(e.target.checked)} />} label={<Typography variant="body2">Repair verified and approved</Typography>} />
                </Box>
              ) : <Typography variant="body2" color="text.secondary">No repair — routine check only.</Typography>}
              {canRelease ? <>
                <TextField select label="Who pays?" value={liability} onChange={(e) => { const next = e.target.value; if (next === 'RIDER' || next === 'DEPOSIT' || next === 'COMPANY') setLiability(next); }}>
                  {/* A walk-in is paid at the counter or by the company — the deposit is for a bike that came back. */}
                  {(walkIn ? ['RIDER', 'COMPANY'] as const : ['RIDER', 'DEPOSIT', 'COMPANY'] as const).map((value) => <MenuItem key={value} value={value} disabled={!job.riderId && value !== 'COMPANY'}>{LIABILITY_LABEL[value]}</MenuItem>)}
                </TextField>
                {walkIn && <TextField label="Spare parts paid now (₹)" value={partsPaid} onChange={(e) => setPartsPaid(e.target.value)} slotProps={{ htmlInput: { inputMode: 'decimal' } }} error={!partsPaidValid}
                  helperText={`Spare parts on this job card: ${rupeesWithSymbol(partsTotal)}. Labour is never charged to the rider.`} />}
                <Typography variant="body2" sx={{ fontWeight: 600 }}>If it passes: {chargeLine} The bike becomes {VEHICLE_STATE_LABEL[releaseState_]}.</Typography>
              </> : <Alert severity="info">You can fail the bike back to the workshop. Fleet and admin roles pass it and send it back out.</Alert>}
              {noteField}
            </>}

            {save.isError && <Alert severity="error">{save.error.message}</Alert>}
            {blocker && <Typography variant="caption" color="text.secondary">{blocker}</Typography>}
          </Box>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'space-between', px: 3, pb: 3, flexWrap: 'wrap', gap: 1 }}>
          <Button color="inherit" onClick={close} disabled={save.isPending}>Cancel</Button>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {dialog === 'QC_RUN' && <Button color="inherit" onClick={() => submit('QC_FAIL')} disabled={save.isPending}>{ctaFor.QC_FAIL}</Button>}
            {!(dialog === 'QC_RUN' && !canRelease) && (
              <Button variant="contained" onClick={() => submit(dialogIntent)} disabled={save.isPending}>{save.isPending ? 'Saving…' : ctaFor[dialogIntent]}</Button>
            )}
          </Box>
        </DialogActions>
      </Dialog>
    </>
  );
}
