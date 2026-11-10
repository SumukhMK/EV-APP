import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
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
import { isServiceQueue, JOB_STAGE_LABEL, JOB_STAGE_TONE, jobStage, QUEUE_STATE, queueForCondition, releaseState, walkInRiderCharge } from '../../lib/serviceWorkflow';
import { useShakeValidation, shakeStyles } from '../../hooks/useShakeValidation';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import { CostLines } from './jobCards/CostLines';
import { linesValid, toItems, toLines, type CostLine } from './jobCards/lineItems';
import { HUBS } from '../../mocks/seed';
import { SERVICE_QUEUES, type DamageCategory, type ServiceJob, type ServiceJobSource, type ServiceLiability, type ServiceQueue } from '../../types';
import { CATEGORY_LABEL, LIABILITY_LABEL, REPAIR_TYPE_LABEL, SERVICE_CATEGORY_LABEL, SOURCE_LABEL, SERVICE_QUEUE_LABEL } from '../../lib/serviceJobLabels';

const deskPath = '/service/assistance';
const columns = { display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 340px' }, gap: 4, mt: 4, alignItems: 'start' };
const damageCategories = ['NONE', 'MINOR', 'MAJOR', 'ACCIDENT'] as const;
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

/** Save keeps the job on the bench; QC hands it to fleet; CLOSE runs QC and closes in one press. */
type Action = 'SAVE' | 'QC' | 'CLOSE';

/**
 * The job card itself, on the page — no pop-ups. Left: what was done and what
 * it cost, editable and saved in place. Right: the QC checklist and who pays,
 * and one button that passes QC and closes the ticket.
 */
function JobRecord({ job, returnTo, onSaved }: { job: ServiceJob; returnTo: string; onSaved: (job: ServiceJob) => void }) {
  // Exchange and deboard, reached from here, come back here when done.
  const { pathname: herePath } = useLocation();
  const { user } = useSession();
  const queryClient = useQueryClient();
  const editable = canManageService(user.roleKey) && job.status !== 'CLOSED';
  const canRelease = canCloseServiceJob(user.roleKey);
  const vehicle = useQuery({ queryKey: ['vehicle', job.vehicleId], queryFn: () => getVehicle(job.vehicleId) });
  const inQC = job.queue === 'QC_PENDING';
  // A walk-in or RSA card is a counter transaction: the rider pays for parts
  // there and then, and only what is left over reaches their weekly payment.
  const walkIn = job.category === 'WALK_IN_RSA';

  const [lines, setLines] = useState<CostLine[]>(() => toLines(job.items));
  const [technician, setTechnician] = useState(job.technician ?? '');
  const [findings, setFindings] = useState(job.workSummary);
  const [waiting, setWaiting] = useState(job.queue === 'PARTS_WAITING');
  const [reference, setReference] = useState(job.reference ?? '');
  const [qcChecks, setQcChecks] = useState<Record<QcCheckId, boolean>>(() => Object.fromEntries(QC_CHECKS.map((c) => [c.id, false])) as Record<QcCheckId, boolean>);
  const [liability, setLiability] = useState<ServiceLiability>(job.liability ?? (job.riderId ? 'RIDER' : 'COMPANY'));
  const [partsPaid, setPartsPaid] = useState(((job.partsPaidPaise ?? 0) / 100).toFixed(2));
  // The last button pressed, so its reason to wait updates as the fields are fixed.
  const [tried, setTried] = useState<Action | null>(null);
  const { containerRef: cardRef, shake: shakeCard } = useShakeValidation();
  const { containerRef: closeRef, shake: shakeClose } = useShakeValidation();

  const priced = toItems(lines);
  const valid = linesValid(lines);
  const total = valid ? priced.reduce((sum, item) => sum + item.costPaise, 0) : 0;
  const partsTotal = valid ? priced.reduce((sum, item) => sum + (item.kind === 'PART' ? item.costPaise : 0), 0) : 0;
  const partsPaidPaise = Math.round(Number(partsPaid) * 100);
  const partsPaidValid = !walkIn || (/^\d+(\.\d{1,2})?$/.test(partsPaid) && Number.isSafeInteger(partsPaidPaise) && partsPaidPaise <= partsTotal);
  const riderCharge = walkInRiderCharge(priced, partsPaidValid ? partsPaidPaise : 0);
  const allChecked = QC_CHECKS.every((c) => qcChecks[c.id]);
  const releaseState_ = releaseState(vehicle.data?.currentRiderId ?? null);
  const payers = !job.riderId ? [] : walkIn ? (['RIDER', 'COMPANY'] as const) : (['RIDER', 'DEPOSIT', 'COMPANY'] as const);
  const payer: ServiceLiability = job.riderId ? liability : 'COMPANY';
  // Back to its bench when the parts arrive; any other list stays where it is.
  const benchQueue: ServiceQueue = job.damageCategory === 'MAJOR' || job.damageCategory === 'ACCIDENT' ? 'MAJOR_REPAIR' : 'MINOR_REPAIR';
  const saveQueue: ServiceQueue = inQC ? 'QC_PENDING' : waiting ? 'PARTS_WAITING' : job.queue === 'PARTS_WAITING' ? benchQueue : job.queue;
  // The API wants a work summary before QC; the item list says it when nobody wrote one.
  const summary = findings.trim() || priced.map((i) => i.label).filter(Boolean).join(', ') || 'Checked — no repair needed';

  const blockerFor = (action: Action) =>
    !valid ? 'Every part or repair line needs a name and an amount of ₹0 or more.'
      : action === 'SAVE' && saveQueue === 'PARTS_WAITING' && !reference.trim() ? 'Say which parts you are waiting for.'
      : action !== 'SAVE' && !technician.trim() ? 'Enter who did the repair.'
      : action === 'CLOSE' && job.repairType !== 'REPAIR_ONLY' && !priced.some((i) => i.kind === 'PART') ? 'This job card is for spare parts. Add at least one part before closing it.'
      : action === 'CLOSE' && !allChecked ? 'Tick every QC check first.'
      : action === 'CLOSE' && !partsPaidValid ? 'Spare parts paid must be ₹0 or more, and no more than the spare parts total.'
      : action === 'CLOSE' && !vehicle.data ? 'Still loading the bike — try again in a moment.'
      : '';

  const save = useMutation({
    mutationFn: async (action: Action) => {
      const base = { jobId: job.id, damageCategory: job.damageCategory, items: priced, technician: technician.trim() || null, reference: reference.trim() || null, actor: user.name };
      if (action === 'SAVE') {
        return updateServiceJob({ ...base, queue: saveQueue, workSummary: findings.trim(), liability: null,
          note: saveQueue === 'PARTS_WAITING' && job.queue !== 'PARTS_WAITING' ? `Waiting for parts: ${reference.trim()}` : 'Job card updated' });
      }
      const toQc = { ...base, queue: 'QC_PENDING' as const, workSummary: summary, liability: null, note: 'Work done, sent for Quality Check' };
      if (action === 'QC') return updateServiceJob(toQc);
      // Passing QC needs the bike in QC first; the API allows no shortcut from the bench.
      if (!inQC) await updateServiceJob(toQc);
      const qcFindings = `QC checklist: ${QC_CHECKS.map((c) => c.label).join(', ')}`;
      return updateServiceJob({
        ...base, queue: 'READY_TO_DEPLOY', workSummary: summary, liability: payer, note: 'QC passed and ticket closed',
        partsPaidPaise: walkIn ? partsPaidPaise : undefined, qcChecks,
        inspection: { vehicleId: job.vehicleId, category: job.damageCategory, notes: qcFindings, items: priced, technician: user.name || technician.trim() || null, estimatedCostPaise: total, nextState: releaseState_ },
      });
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['service-jobs', 'detail', job.id], { ...updated });
      onSaved(updated);
      invalidateServiceJobs(queryClient);
    },
    // A close can fail after the bike reached QC; refresh the lists so they say so.
    onError: () => invalidateServiceJobs(queryClient),
  });
  const run = (action: Action) => {
    const blocker = blockerFor(action);
    setTried(action);
    if (blocker) { (action === 'CLOSE' && valid && technician.trim() ? shakeClose : shakeCard)(); return; }
    save.mutate(action);
  };
  const chargeLine = !job.riderId ? 'No rider on this bike, so the company covers the cost.'
    : `Rider ${job.riderId} is charged ${rupeesWithSymbol(payer === 'COMPANY' ? 0 : walkIn ? riderCharge : total)}${payer === 'DEPOSIT' ? ' from their deposit' : payer === 'COMPANY' ? ' — the company covers it' : walkIn ? ' in Weekly Payments' : ''}.`;

  return (
    <>
      <PageHeader section="Service management / Job" title={`${job.vehicleId} · ${job.id}`} backTo={returnTo} backLabel="Back to jobs"
        actions={<StateChip label={JOB_STAGE_LABEL[jobStage(job)]} tone={JOB_STAGE_TONE[jobStage(job)]} />}
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
            {editable && vehicle.data?.currentRiderId && <Box sx={{ mt: 3 }}>
              <Typography variant="body2" color="text.secondary">The rider still has this bike on their name. Give them a different bike, or end the assignment.</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 2 }}>
                <Button component={Link} to={`/assignments/exchange?riderId=${vehicle.data.currentRiderId}`} state={{ returnTo: herePath }}>Give another bike</Button>
                <Button component={Link} to={`/assignments/deboard?riderId=${vehicle.data.currentRiderId}`} state={{ returnTo: herePath }} color="inherit">End assignment</Button>
              </Box>
            </Box>}
          </Panel>

          {editable ? (
            <Panel label="Job card">
              <Box ref={cardRef} component="fieldset" disabled={save.isPending} sx={{ border: 0, p: 0, m: 0, minWidth: 0, display: 'grid', gap: 3, ...shakeStyles }}>
                {!inQC && (
                  <ToggleButtonGroup exclusive color="primary" value={waiting ? 'PARTS_WAITING' : 'UNDER_REPAIR'} aria-label="Status" sx={{ justifySelf: 'start' }}
                    onChange={(_, next) => { if (next) setWaiting(next === 'PARTS_WAITING'); }}>
                    <ToggleButton value="UNDER_REPAIR">Under Repair</ToggleButton>
                    <ToggleButton value="PARTS_WAITING">Parts Waiting</ToggleButton>
                  </ToggleButtonGroup>
                )}
                {!inQC && waiting && <TextField required label="Which parts, and when are they expected?" placeholder="e.g. Brake pads, Friday" value={reference} onChange={(e) => setReference(e.target.value)} />}
                <CostLines lines={lines} onChange={setLines} />
                {total > 500000 && <Alert severity="warning">This is over ₹5,000. Check the amounts.</Alert>}
                <TextField required label="Repaired by (Technician)" placeholder="Name" value={technician} onChange={(e) => setTechnician(e.target.value)} />
                <TextField label="Work done (optional)" multiline minRows={2} value={findings} onChange={(e) => setFindings(e.target.value)} />
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                  <Button variant="outlined" onClick={() => run('SAVE')}>{save.isPending && save.variables === 'SAVE' ? 'Saving…' : 'Save'}</Button>
                  {!canRelease && !inQC && <Button variant="contained" onClick={() => run('QC')}>{save.isPending && save.variables === 'QC' ? 'Saving…' : 'Work done — send for QC'}</Button>}
                </Box>
              </Box>
            </Panel>
          ) : (
            <Panel label="What was done, and what it cost">
              <Box sx={{ display: 'grid', gap: 3 }}>
                <Typography sx={{ whiteSpace: 'pre-wrap' }}>{job.workSummary || 'Nothing written down yet.'}</Typography>
                {job.items.map((item, i) => <Box key={i} sx={{ display: 'flex', gap: 3, justifyContent: 'space-between' }}><Typography>{item.kind === 'PART' || !item.kind ? 'Part' : 'Repair'} · {item.label}</Typography><Typography>{rupeesWithSymbol(item.costPaise)}</Typography></Box>)}
                <Typography color="text.secondary">Done by: {job.technician || 'Not noted'}</Typography>
              </Box>
            </Panel>
          )}

          <Panel label="What happened so far">
            {job.activity.length === 0 ? <Typography color="text.secondary">Nothing has been added yet. What we already knew is shown above.</Typography> : [...job.activity].reverse().map((event, i) => (
              <Box key={i} sx={{ py: 3, borderBottom: 1, borderColor: 'divider' }}>
                <Typography variant="body2">{JOB_STAGE_LABEL[jobStage({ queue: event.queue, status: 'IN_PROGRESS' })]}</Typography>
                <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', mt: 1 }}>{event.note}</Typography>
                <Typography variant="caption" color="text.secondary">{event.actor} · {formatDateTime(event.occurredOn)}</Typography>
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

        <Panel label={editable ? 'QC and close ticket' : 'How it ended'}>
          <Typography color="text.secondary" variant="body2">{job.status === 'CLOSED' ? 'Final cost' : 'Cost so far'}</Typography>
          <Typography sx={{ fontSize: 28, fontWeight: 600, mt: 1, mb: 3 }}>{rupeesWithSymbol(editable ? total : job.totalCostPaise)}</Typography>
          {!editable ? <DefinitionList items={[
            { label: 'Who paid', value: job.liability ? LIABILITY_LABEL[job.liability] : 'Nobody was charged' },
            { label: 'Finished on', value: job.closedOn ? formatDateTime(job.closedOn) : 'Not finished yet' },
            { label: 'Parts note', value: job.reference ?? 'None' },
          ]} /> : !canRelease ? (
            <Typography variant="body2" color="text.secondary">
              {inQC ? 'Waiting for fleet staff to do the QC and close the ticket.' : 'When the work is done, press "Work done — send for QC". Fleet staff do the QC and close the ticket.'}
            </Typography>
          ) : (
            <Box ref={closeRef} component="fieldset" disabled={save.isPending} sx={{ border: 0, p: 0, m: 0, minWidth: 0, display: 'grid', gap: 2, ...shakeStyles }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="subtitle2">Quality check</Typography>
                <Button size="small" color={allChecked ? 'inherit' : 'primary'}
                  onClick={() => setQcChecks(Object.fromEntries(QC_CHECKS.map((c) => [c.id, !allChecked])) as Record<QcCheckId, boolean>)}>
                  {allChecked ? 'Uncheck all' : 'Check all'}
                </Button>
              </Box>
              <Box sx={{ display: 'grid', gap: 0.5 }}>
                {QC_CHECKS.map((check) => (
                  <FormControlLabel key={check.id} sx={{ border: 1, borderColor: qcChecks[check.id] ? 'success.main' : 'divider', borderRadius: 1.5, m: 0, px: 1 }}
                    control={<Checkbox size="small" checked={qcChecks[check.id]} onChange={(e) => setQcChecks({ ...qcChecks, [check.id]: e.target.checked })} />}
                    label={<Typography variant="body2">{check.label}</Typography>} />
                ))}
              </Box>
              {payers.length > 0 && (
                <ToggleButtonGroup exclusive fullWidth size="small" color="primary" value={liability} aria-label="Who pays?"
                  onChange={(_, next) => { if (next === 'RIDER' || next === 'DEPOSIT' || next === 'COMPANY') setLiability(next); }}>
                  {payers.map((value) => <ToggleButton key={value} value={value}>{value === 'RIDER' ? 'Rider' : value === 'DEPOSIT' ? 'Deposit' : 'Company'}</ToggleButton>)}
                </ToggleButtonGroup>
              )}
              {walkIn && payer === 'RIDER' && <TextField size="small" label="Spare parts paid now (₹)" value={partsPaid} onChange={(e) => setPartsPaid(e.target.value)}
                slotProps={{ htmlInput: { inputMode: 'decimal' } }} error={!partsPaidValid}
                helperText={`Parts on this card: ${rupeesWithSymbol(partsTotal)}. Labour is never charged to the rider.`} />}
              <Typography variant="body2">{chargeLine} The bike becomes {VEHICLE_STATE_LABEL[releaseState_]}.</Typography>
              <Button variant="contained" color="success" onClick={() => run('CLOSE')}>{save.isPending && save.variables === 'CLOSE' ? 'Closing…' : 'Pass QC & close ticket'}</Button>
            </Box>
          )}
          {tried && blockerFor(tried) && <Typography variant="caption" color="error" sx={{ display: 'block', mt: 2 }}>{blockerFor(tried)}</Typography>}
          {save.isError && <Alert severity="error" sx={{ mt: 2 }}>{save.error.message}</Alert>}
        </Panel>
      </Box>
    </>
  );
}
