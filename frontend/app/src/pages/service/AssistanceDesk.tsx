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
import { formatDate, rupeesWithSymbol } from '../../lib/format';
import { canCloseServiceJob } from '../../lib/roles';
import { CATEGORY_LABEL, CATEGORY_TONE, SOURCE_LABEL } from '../../lib/serviceJobLabels';

export function AssistanceDesk() {
  const { user } = useSession();
  const mobile = useMediaQuery(useTheme().breakpoints.down('sm'));
  const canWork = canCloseServiceJob(user.roleKey);
  const [params, setParams] = useSearchParams();
  const search = params.get('search') ?? '';
  const rawStatus = params.get('status') ?? 'OPEN';
  const status = ['OPEN', 'CLOSED', 'ALL'].includes(rawStatus) ? rawStatus : 'ALL';
  const jobs = useQuery({ queryKey: ['service-jobs', 'list'], queryFn: () => listServiceJobs() });
  const all = jobs.data ?? [];
  const openCount = all.filter((j) => j.status !== 'CLOSED').length;
  const rows = all.filter((j) =>
    (status === 'ALL' || (status === 'CLOSED' ? j.status === 'CLOSED' : j.status !== 'CLOSED')) &&
    `${j.id} ${j.vehicleId} ${j.damageNotes ?? ''} ${SOURCE_LABEL[j.source]}`.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const returnTo = `/service/assistance${params.size ? `?${params}` : ''}`;
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
        title="Assistance desk"
        icon={SupportAgentIcon}
        actions={canWork ? newJob : undefined}
      />
      <Typography color="text.secondary" variant="body2" sx={{ mt: 3 }}>Log requests, record the work, and review who pays.</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: { xs: 2, sm: 3 }, mt: 4 }}>
        {[
          { label: 'Open', value: openCount, filter: 'OPEN' },
          { label: 'Closed', value: all.length - openCount, filter: 'CLOSED' },
          { label: 'All jobs', value: all.length, filter: 'ALL' },
        ].map((tile) => (
          <Box key={tile.label} component={Link} to={`/service/assistance?status=${tile.filter}`} sx={{ color: 'inherit', textDecoration: 'none' }}>
            <Panel label={tile.label} sx={{ p: { xs: 2.5, sm: 4 }, '&:hover': { borderColor: 'primary.main' } }}>
              <Mono sx={{ fontSize: 26, fontWeight: 600 }}>{jobs.isPending || jobs.isError ? '—' : tile.value}</Mono>
            </Panel>
          </Box>
        ))}
      </Box>
      {!canWork && <Alert severity="info" sx={{ mt: 3 }}>View-only access. You can open any job to review its details.</Alert>}
      <Panel label="Jobs" sx={{ mt: 4 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1fr) 200px' }, gap: 3, mb: 4 }}>
          <TextField label="Search jobs" placeholder="Job, vehicle, source or notes" value={search} onChange={(e) => updateFilter('search', e.target.value)} />
          <TextField select label="Status" value={status} onChange={(e) => updateFilter('status', e.target.value)}>
            <MenuItem value="OPEN">Open ({openCount})</MenuItem>
            <MenuItem value="CLOSED">Closed ({all.length - openCount})</MenuItem>
            <MenuItem value="ALL">All jobs ({all.length})</MenuItem>
          </TextField>
        </Box>
        {jobs.isPending ? <EmptyState title="Loading jobs…" /> : jobs.isError ? (
          <Alert severity="error" action={<Button color="inherit" onClick={() => void jobs.refetch()}>Retry</Button>}>{jobs.error.message}</Alert>
        ) : rows.length === 0 ? (
          <EmptyState
            title={all.length ? 'No matching jobs' : 'No jobs yet'}
            description={all.length ? 'Try a different search or status.' : 'Deboarding creates a job automatically. Use New job for RSA, QRT or a walk-in.'}
            action={all.length ? <Button onClick={() => setParams({ status: 'ALL' }, { replace: true })}>Clear filters</Button> : canWork ? newJob : undefined}
          />
        ) : mobile ? (
          <Box sx={{ display: 'grid', gap: 3 }}>
            {rows.map((j) => (
              <Box key={j.id} sx={{ borderTop: 1, borderColor: 'divider', pt: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                  <Button component={Link} to={`/service/assistance/${j.id}`} state={{ returnTo }} color="inherit"><Mono>{j.id}</Mono></Button>
                  <StateChip label={j.status === 'CLOSED' ? 'Closed' : j.status === 'IN_PROGRESS' ? 'In progress' : 'Open'} tone={j.status === 'CLOSED' ? 'good' : 'neutral'} />
                </Box>
                <Typography variant="body2" sx={{ mt: 2 }}>{j.vehicleId} · {SOURCE_LABEL[j.source]}</Typography>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mt: 2 }}>
                  <StateChip label={CATEGORY_LABEL[j.damageCategory]} tone={CATEGORY_TONE[j.damageCategory]} />
                  <Mono>{j.status === 'CLOSED' ? rupeesWithSymbol(j.totalCostPaise) : 'Not priced'}</Mono>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>Opened {formatDate(j.createdOn)}</Typography>
              </Box>
            ))}
          </Box>
        ) : (
          <SimpleTable
            scrollable
            rows={rows}
            getRowKey={(j) => j.id}
            columns={[
              { key: 'job', header: 'Job / vehicle', width: 180, render: (j) => (
                <Box>
                  <Button component={Link} to={`/service/assistance/${j.id}`} state={{ returnTo }} color="inherit" sx={{ px: 0 }}><Mono>{j.id}</Mono></Button>
                  <Mono sx={{ display: 'block', color: 'text.secondary' }}>{j.vehicleId}</Mono>
                </Box>
              ) },
              { key: 'source', header: 'Source', width: 180, render: (j) => SOURCE_LABEL[j.source] },
              { key: 'damage', header: 'Damage', width: 110, render: (j) => <StateChip label={CATEGORY_LABEL[j.damageCategory]} tone={CATEGORY_TONE[j.damageCategory]} /> },
              { key: 'status', header: 'Status', width: 110, render: (j) => <StateChip label={j.status === 'CLOSED' ? 'Closed' : j.status === 'IN_PROGRESS' ? 'In progress' : 'Open'} tone={j.status === 'CLOSED' ? 'good' : 'neutral'} /> },
              { key: 'opened', header: 'Opened', width: 130, render: (j) => formatDate(j.createdOn) },
              { key: 'cost', header: 'Final cost', width: 110, align: 'right', render: (j) => <Mono>{j.status === 'CLOSED' ? rupeesWithSymbol(j.totalCostPaise) : 'Not priced'}</Mono> },
            ]}
          />
        )}
      </Panel>
    </>
  );
}
