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

function waitingLabel(createdOn: string) {
  const days = daysSince(createdOn);
  return days === 0 ? 'Today' : days === 1 ? '1 day' : `${days} days`;
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

  const title = mode === 'queues' ? 'Bikes in service' : mode === 'qc' ? 'QC queue' : 'Help desk';

  return (
    <>
      <PageHeader
        section="Service management"
        title={title}
        icon={SupportAgentIcon}
        actions={canWork ? <Button component={Link} to="/service/assistance/new" state={{ returnTo }} startIcon={<AddIcon />}>New job</Button> : undefined}
      />

      {!canWork && <Alert severity="info" sx={{ mt: 3 }}>View only — you cannot create or edit jobs.</Alert>}

      {/* Queue filter chips — queues and qc modes */}
      {mode !== 'intake' && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 3 }}>
          <Button size="small" color={allOpenActive ? 'primary' : 'inherit'} variant={allOpenActive ? 'contained' : 'outlined'} onClick={() => setParams({ status: 'OPEN' }, { replace: true })}>
            All open{jobs.data ? ` (${openCount})` : ''}
          </Button>
          {SERVICE_QUEUES.filter((q) => q !== 'READY_TO_DEPLOY' && (mode !== 'qc' || q === 'QC_PENDING')).map((q) => (
            <Button key={q} size="small" color={queue === q ? 'primary' : 'inherit'} variant={queue === q ? 'contained' : 'outlined'} onClick={() => { const next = new URLSearchParams(); next.set('queue', q); next.set('status', 'OPEN'); setParams(next, { replace: true }); }}>
              {SERVICE_QUEUE_LABEL[q]}{jobs.data ? ` (${all.filter((j) => j.status !== 'CLOSED' && j.queue === q).length})` : ''}
            </Button>
          ))}
        </Box>
      )}

      {repairOnly && <Alert severity="info" sx={{ mt: 3 }}>Filtered to In Service bikes only.</Alert>}

      {/* Search + filters */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: mode === 'qc' ? 'minmax(0, 1fr) 220px' : 'minmax(0, 1fr) 180px 220px' }, gap: 3, mt: 3 }}>
        <TextField size="small" label="Search" placeholder="Job, bike or notes" value={search} onChange={(e) => updateFilter('search', e.target.value)} />
        {mode !== 'qc' && <TextField select size="small" label="Status" value={status} onChange={(e) => updateFilter('status', e.target.value)}>
          <MenuItem value="OPEN">Open</MenuItem>
          <MenuItem value="CLOSED">Closed</MenuItem>
          <MenuItem value="ALL">All</MenuItem>
        </TextField>}
        <TextField select size="small" label="Source" value={source} onChange={(e) => updateFilter('source', e.target.value)}>
          <MenuItem value="ALL">Any</MenuItem>
          {(Object.keys(SOURCE_LABEL) as ServiceJobSource[]).map((s) => <MenuItem key={s} value={s}>{SOURCE_LABEL[s]}</MenuItem>)}
        </TextField>
      </Box>

      {/* Jobs table */}
      <Box sx={{ mt: 3 }}>
        {jobs.isPending ? <EmptyState title="Loading…" /> : jobs.isError ? (
          <Alert severity="error" action={<Button color="inherit" onClick={() => void jobs.refetch()}>Retry</Button>}>{jobs.error.message}</Alert>
        ) : rows.length === 0 ? (
          <EmptyState
            title={all.length ? 'No jobs match' : 'No jobs yet'}
            action={all.length ? <Button onClick={() => setParams({ status: 'ALL' }, { replace: true })}>Clear filters</Button> : undefined}
          />
        ) : mobile ? (
          <Box sx={{ display: 'grid', gap: 2 }}>
            {rows.map((j) => (
              <Box key={j.id} component={Link} to={`/service/assistance/${j.id}`} state={{ returnTo }} sx={{ display: 'block', borderTop: 1, borderColor: 'divider', pt: 2, color: 'inherit', textDecoration: 'none' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                  <Mono sx={{ fontSize: 13 }}>{j.id} · {j.vehicleId}</Mono>
                  <StateChip label={SERVICE_QUEUE_LABEL[j.queue]} tone={CATEGORY_TONE[j.damageCategory]} />
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1, fontSize: 13, color: 'text.secondary' }}>
                  <span>{SOURCE_LABEL[j.source]}</span>
                  <span>{j.status === 'CLOSED' ? 'Closed' : waitingLabel(j.createdOn)}</span>
                </Box>
              </Box>
            ))}
          </Box>
        ) : (
          <SimpleTable
            scrollable
            rows={rows}
            getRowKey={(j) => j.id}
            columns={[
              { key: 'job', header: 'Job / bike', width: 160, render: (j) => (
                <Box>
                  <Button component={Link} to={`/service/assistance/${j.id}`} state={{ returnTo }} color="inherit" sx={{ px: 0 }}><Mono>{j.id}</Mono></Button>
                  <Mono sx={{ display: 'block', color: 'text.secondary', fontSize: 12 }}>{j.vehicleId}</Mono>
                </Box>
              ) },
              { key: 'source', header: 'Source', width: 130, render: (j) => SOURCE_LABEL[j.source] },
              { key: 'queue', header: 'Queue', width: 130, render: (j) => SERVICE_QUEUE_LABEL[j.queue] },
              { key: 'damage', header: 'Damage', width: 100, render: (j) => <StateChip label={needsDamageAssessment(j) ? 'Unchecked' : CATEGORY_LABEL[j.damageCategory]} tone={CATEGORY_TONE[j.damageCategory]} /> },
              { key: 'status', header: 'Status', width: 100, render: (j) => <StateChip label={j.status === 'CLOSED' ? 'Closed' : j.status === 'IN_PROGRESS' ? 'In progress' : 'Open'} tone={j.status === 'CLOSED' ? 'good' : 'neutral'} /> },
              { key: 'waiting', header: 'Waiting', width: 90, render: (j) => (
                <Typography variant="body2" color={j.status !== 'CLOSED' && daysSince(j.createdOn) > 7 ? 'warning.main' : 'text.secondary'}>
                  {j.status === 'CLOSED' ? '—' : waitingLabel(j.createdOn)}
                </Typography>
              ) },
              { key: 'cost', header: 'Cost', width: 90, align: 'center', render: (j) => <Mono sx={{ fontSize: 12 }}>{j.totalCostPaise > 0 || j.status === 'CLOSED' ? rupeesWithSymbol(j.totalCostPaise) : '—'}</Mono> },
              { key: 'action', header: '', width: 110, render: (j) => <Button size="small" component={Link} to={`/service/assistance/${j.id}`} state={{ returnTo }}>{j.status === 'CLOSED' ? 'View' : j.queue === 'QC_PENDING' ? 'QC check' : 'Open'}</Button> },
            ]}
          />
        )}
      </Box>

      {/* Counts footer */}
      {jobs.data && rows.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
          {rows.length} job{rows.length !== 1 ? 's' : ''} shown
        </Typography>
      )}
    </>
  );
}
