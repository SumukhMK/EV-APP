import SupportAgentIcon from '@mui/icons-material/SupportAgentOutlined';
import AddIcon from '@mui/icons-material/AddOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { useSession } from '../../app/sessionContext';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { Mono } from '../../components/Mono';
import { Panel } from '../../components/Panel';
import { SimpleTable } from '../../components/SimpleTable';
import { StateChip } from '../../components/StateChip';
import { listServiceJobs } from '../../lib/api/serviceJobs';
import { daysSince, formatDate, preciseRupeesWithSymbol as rupeesWithSymbol } from '../../lib/format';
import { canManageService } from '../../lib/roles';
import { CATEGORY_LABEL, CATEGORY_TONE, SOURCE_LABEL, SERVICE_QUEUE_LABEL } from '../../lib/serviceJobLabels';
import { SERVICE_QUEUES, type ServiceJobSource } from '../../types';
import { isServiceQueue, needsDamageAssessment, QUEUE_STATE } from '../../lib/serviceWorkflow';

/** How long a job has been sitting, in words an operator can act on. */
function waitingLabel(createdOn: string) {
  const days = daysSince(createdOn);
  return days === 0 ? 'Came in today' : days === 1 ? 'Waiting 1 day' : `Waiting ${days} days`;
}

export function AssistanceDesk({ mode = 'intake' }: { mode?: 'intake' | 'queues' | 'qc' }) {
  const { user } = useSession();
  const mobile = useMediaQuery(useTheme().breakpoints.down('sm'));
  const canWork = canManageService(user.roleKey);
  const [params, setParams] = useSearchParams();
  const search = params.get('search') ?? '';
  const rawStatus = params.get('status') ?? 'OPEN';
  const status = mode === 'qc' ? 'OPEN' : ['OPEN', 'CLOSED', 'ALL'].includes(rawStatus) ? rawStatus : 'ALL';
  const rawQueue = params.get('queue') ?? '';
  const queue = mode === 'qc' ? 'QC_PENDING' : isServiceQueue(rawQueue) ? rawQueue : 'ALL';
  const rawSource = params.get('source') ?? 'ALL';
  const source = Object.hasOwn(SOURCE_LABEL, rawSource) ? rawSource : 'ALL';
  const repairOnly = mode !== 'qc' && params.get('state') === 'UNDER_REPAIR';
  const allOpenActive = status === 'OPEN' && queue === 'ALL' && !repairOnly;
  const jobs = useQuery({ queryKey: ['service-jobs', 'list'], queryFn: () => listServiceJobs() });
  const all = jobs.data ?? [];
  const openCount = all.filter((j) => j.status !== 'CLOSED').length;
  const qcCount = all.filter((j) => j.status !== 'CLOSED' && j.queue === 'QC_PENDING').length;
  const rows = all.filter((j) =>
    (status === 'ALL' || (status === 'CLOSED' ? j.status === 'CLOSED' : j.status !== 'CLOSED')) &&
    (queue === 'ALL' || j.queue === queue) &&
    (source === 'ALL' || j.source === source) &&
    (!repairOnly || QUEUE_STATE[j.queue] === 'UNDER_REPAIR') &&
    `${j.id} ${j.vehicleId} ${j.damageNotes ?? ''} ${SOURCE_LABEL[j.source]}`.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const basePath = mode === 'queues' ? '/service/queues' : mode === 'qc' ? '/service/qc' : '/service/assistance';
  const returnTo = `${basePath}${params.size ? `?${params}` : ''}`;
  const updateFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  const newJob = <Button component={Link} to="/service/assistance/new" state={{ returnTo }} startIcon={<AddIcon />}>New job</Button>;

  return (
    <>
      <PageHeader
        section="Service management"
        title={mode === 'queues' ? 'Bikes in service' : mode === 'qc' ? 'QC queue' : 'Help desk'}
        icon={SupportAgentIcon}
        actions={canWork ? newJob : undefined}
      />
      <Typography color="text.secondary" variant="body2" sx={{ mt: 3 }}>
        {mode === 'intake' ? 'Log a bike that a rider brought in, or one the roadside / rescue team picked up, and send it straight to the right list.' : 'Open a job to check the bike, note the work and cost, move it to another list, or send it back on the road. No need to go through the bike page.'}
      </Typography>
      {mode === 'qc' ? (
        <Panel label="Waiting for QC" subtitle="QC is the last check before a bike goes back on the road. Open a job, write what you checked, then pass or fail it. A failed bike goes back for repair and can come here again." sx={{ mt: 4 }}>
          <Mono sx={{ fontSize: 26, fontWeight: 600 }}>{jobs.isPending || jobs.isError ? '—' : qcCount}</Mono>
          <Button component={Link} to="/service/queues" sx={{ ml: 3 }}>See all bikes in service</Button>
        </Panel>
      ) : <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: { xs: 2, sm: 3 }, mt: 4 }}>
        {[
          { label: 'Still open', value: openCount, filter: 'OPEN' },
          { label: 'Finished', value: all.length - openCount, filter: 'CLOSED' },
          { label: 'All jobs', value: all.length, filter: 'ALL' },
        ].map((tile) => (
          <Box key={tile.label} component={Link} to={`${basePath}?status=${tile.filter}`} sx={{ color: 'inherit', textDecoration: 'none' }}>
            <Panel label={tile.label} sx={{ p: { xs: 2.5, sm: 4 }, '&:hover': { borderColor: 'primary.main' } }}>
              <Mono sx={{ fontSize: 26, fontWeight: 600 }}>{jobs.isPending || jobs.isError ? '—' : tile.value}</Mono>
            </Panel>
          </Box>
        ))}
      </Box>}
      {!canWork && <Alert severity="info" sx={{ mt: 3 }}>You can look at any job, but you cannot change it.</Alert>}
      {mode !== 'qc' && (
        <Panel label="What needs doing" subtitle="Pick a list to see only those bikes. Small and big repairs are two lists, but the bike shows as 'Under repair' in both. The waiting column tells you how long a bike has been sitting." sx={{ mt: 4 }}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
            <Button color={allOpenActive ? 'primary' : 'inherit'} variant={allOpenActive ? 'contained' : 'outlined'} onClick={() => setParams({ status: 'OPEN' }, { replace: true })}>Still open{jobs.data ? ` (${openCount})` : ''}</Button>
            {SERVICE_QUEUES.filter((q) => q !== 'READY_TO_DEPLOY').map((q) => (
              <Button key={q} color={status === 'OPEN' && queue === q ? 'primary' : 'inherit'} variant={status === 'OPEN' && queue === q ? 'contained' : 'outlined'} onClick={() => { const next = new URLSearchParams(); next.set('queue', q); next.set('status', 'OPEN'); setParams(next, { replace: true }); }}>
                {SERVICE_QUEUE_LABEL[q]}{jobs.data ? ` (${all.filter((j) => j.status !== 'CLOSED' && j.queue === q).length})` : ''}
              </Button>
            ))}
          </Box>
        </Panel>
      )}
      {repairOnly && <Alert severity="info" sx={{ mt: 3 }}>Showing every bike marked Under repair: still to check, small repair, big repair, warranty, insurance and waiting for parts.</Alert>}
      <Panel label="Jobs" subtitle={jobs.data ? `${rows.length} jobs match` : undefined} sx={{ mt: 4 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: mode === 'qc' ? 'minmax(0, 1fr) 220px' : 'minmax(0, 1fr) 180px 220px' }, gap: 3, mb: 4 }}>
          <TextField label="Search jobs" placeholder="Job number, bike number or notes" value={search} onChange={(e) => updateFilter('search', e.target.value)} />
          {mode !== 'qc' && <TextField select label="Status" value={status} onChange={(e) => updateFilter('status', e.target.value)}>
            <MenuItem value="OPEN">Still open</MenuItem>
            <MenuItem value="CLOSED">Finished</MenuItem>
            <MenuItem value="ALL">All jobs</MenuItem>
          </TextField>}
          <TextField select label="Came in as" value={source} onChange={(e) => updateFilter('source', e.target.value)}>
            <MenuItem value="ALL">Any way</MenuItem>
            {(Object.keys(SOURCE_LABEL) as ServiceJobSource[]).map((s) => <MenuItem key={s} value={s}>{SOURCE_LABEL[s]}</MenuItem>)}
          </TextField>
        </Box>
        {jobs.isPending ? <EmptyState title="Loading jobs…" /> : jobs.isError ? (
          <Alert severity="error" action={<Button color="inherit" onClick={() => void jobs.refetch()}>Retry</Button>}>{jobs.error.message}</Alert>
        ) : rows.length === 0 ? (
          <EmptyState
            title={mode === 'qc' && !qcCount ? 'No bikes waiting for QC' : all.length ? 'No jobs match' : 'No jobs yet'}
            description={mode === 'qc' ? 'Bikes show up here once the repair work is done. Clear the filters to see everything waiting.' : all.length ? 'Try a different search or filter.' : 'A job is created on its own when a rider gives a bike back. Use New job for roadside help, the rescue team, or a rider who came to the hub.'}
            action={all.length ? <Button onClick={() => setParams({ status: 'ALL' }, { replace: true })}>Clear filters</Button> : canWork ? newJob : undefined}
          />
        ) : mobile ? (
          <Box sx={{ display: 'grid', gap: 3 }}>
            {rows.map((j) => (
              <Box key={j.id} sx={{ borderTop: 1, borderColor: 'divider', pt: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                  <Button component={Link} to={`/service/assistance/${j.id}`} state={{ returnTo }} color="inherit"><Mono>{j.id}</Mono></Button>
                  <StateChip label={j.status === 'CLOSED' ? 'Finished' : j.status === 'IN_PROGRESS' ? 'Being worked on' : 'Not started'} tone={j.status === 'CLOSED' ? 'good' : 'neutral'} />
                </Box>
                <Typography variant="body2" sx={{ mt: 2 }}>{j.vehicleId} · {SERVICE_QUEUE_LABEL[j.queue]}</Typography>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mt: 2 }}>
                  <StateChip label={needsDamageAssessment(j) ? 'Not checked yet' : CATEGORY_LABEL[j.damageCategory]} tone={CATEGORY_TONE[j.damageCategory]} />
                  <Mono>{j.items.length || j.status === 'CLOSED' ? rupeesWithSymbol(j.totalCostPaise) : 'No cost yet'}</Mono>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>{j.status === 'CLOSED' ? `Finished ${formatDate(j.closedOn ?? j.updatedOn)}` : `${waitingLabel(j.createdOn)} · came in ${formatDate(j.createdOn)}`}</Typography>
                <Button component={Link} to={`/service/assistance/${j.id}`} state={{ returnTo }} sx={{ mt: 2 }}>{j.status === 'CLOSED' ? 'See details' : j.queue === 'QC_PENDING' ? 'Do the QC check' : 'Open job'}</Button>
              </Box>
            ))}
          </Box>
        ) : (
          <SimpleTable
            scrollable
            rows={rows}
            getRowKey={(j) => j.id}
            columns={[
              { key: 'job', header: 'Job / bike', width: 180, render: (j) => (
                <Box>
                  <Button component={Link} to={`/service/assistance/${j.id}`} state={{ returnTo }} color="inherit" sx={{ px: 0 }}><Mono>{j.id}</Mono></Button>
                  <Mono sx={{ display: 'block', color: 'text.secondary' }}>{j.vehicleId}</Mono>
                </Box>
              ) },
              { key: 'queue', header: 'What it needs', width: 150, render: (j) => SERVICE_QUEUE_LABEL[j.queue] },
              { key: 'damage', header: 'Damage', width: 110, render: (j) => <StateChip label={needsDamageAssessment(j) ? 'Not checked yet' : CATEGORY_LABEL[j.damageCategory]} tone={CATEGORY_TONE[j.damageCategory]} /> },
              { key: 'status', header: 'Status', width: 120, render: (j) => <StateChip label={j.status === 'CLOSED' ? 'Finished' : j.status === 'IN_PROGRESS' ? 'Being worked on' : 'Not started'} tone={j.status === 'CLOSED' ? 'good' : 'neutral'} /> },
              { key: 'waiting', header: 'Waiting', width: 150, render: (j) => (
                <Box>
                  <Typography variant="body2" color={j.status !== 'CLOSED' && daysSince(j.createdOn) > 7 ? 'warning.main' : undefined}>
                    {j.status === 'CLOSED' ? 'Finished' : waitingLabel(j.createdOn)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">Came in {formatDate(j.createdOn)}</Typography>
                </Box>
              ) },
              { key: 'cost', header: 'Cost so far', width: 110, align: 'right', render: (j) => <Mono>{j.items.length || j.status === 'CLOSED' ? rupeesWithSymbol(j.totalCostPaise) : 'No cost yet'}</Mono> },
              { key: 'action', header: 'What to do', width: 150, render: (j) => <Button component={Link} to={`/service/assistance/${j.id}`} state={{ returnTo }}>{j.status === 'CLOSED' ? 'See details' : j.queue === 'QC_PENDING' ? 'Do the QC check' : 'Open job'}</Button> },
            ]}
          />
        )}
      </Panel>
    </>
  );
}
