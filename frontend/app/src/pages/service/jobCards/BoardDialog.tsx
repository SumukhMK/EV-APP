import AddIcon from '@mui/icons-material/AddOutlined';
import CloseIcon from '@mui/icons-material/CloseOutlined';
import SearchIcon from '@mui/icons-material/SearchOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { EmptyState } from '../../../components/EmptyState';
import { EntityId } from '../../../components/EntityId';
import { Mono } from '../../../components/Mono';
import { SimpleTable, type Column } from '../../../components/SimpleTable';
import { StateChip } from '../../../components/StateChip';
import { TableFooter } from '../../../components/TableFooter';
import { formatDateTime } from '../../../lib/format';
import { REPAIR_TYPE_LABEL, RETURN_SOURCE_LABEL } from '../../../lib/serviceJobLabels';
import { JOB_STAGE_LABEL, JOB_STAGE_TONE, jobStage, type JobStage } from '../../../lib/serviceWorkflow';
import type { ServiceJob } from '../../../types';

export type BoardKey = 'walk-in' | 'hub' | 'all';

const PAGE_SIZE = 12;
const jobPath = (job: ServiceJob) => `/service/assistance/${job.id}`;

const BOARD: Record<BoardKey, { overline: string; title: string; empty: string; stages: JobStage[] }> = {
  'walk-in': { overline: 'CATEGORY 01', title: 'Walk-in & RSA', empty: 'No walk-in or RSA job cards yet.', stages: ['UNDER_REPAIR', 'QC_PENDING', 'CLOSED'] },
  hub: { overline: 'CATEGORY 02', title: 'Hub Service', empty: 'No returned or recovered vehicle job cards yet.', stages: ['UNDER_REPAIR', 'PARTS_WAITING', 'QC_PENDING', 'CLOSED'] },
  all: { overline: 'EVERY CATEGORY', title: 'All job cards', empty: 'No job cards yet.', stages: ['UNDER_REPAIR', 'PARTS_WAITING', 'QC_PENDING', 'CLOSED'] },
};

/** Who opened the card: the executive named on it, else whoever first touched it. */
const createdByOf = (job: ServiceJob) => job.createdBy || job.activity[0]?.actor || '—';

/** The job's one status, the same words on every board; a closed card also says when. */
function Stage({ job }: { job: ServiceJob }) {
  const stage = jobStage(job);
  return (
    <Box sx={{ minWidth: 0 }}>
      <StateChip label={JOB_STAGE_LABEL[stage]} tone={JOB_STAGE_TONE[stage]} />
      {stage === 'CLOSED' && job.closedOn && (
        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', mt: 0.5 }}>{formatDateTime(job.closedOn)}</Typography>
      )}
    </Box>
  );
}

/** Created By over Resolved By, so the two names share one column. */
function People({ job }: { job: ServiceJob }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="body2" noWrap>{createdByOf(job)}</Typography>
      <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>{job.technician || '—'}</Typography>
    </Box>
  );
}

function RiderVehicle({ job }: { job: ServiceJob }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="body2" noWrap>{job.riderId ? `${job.riderId} — ${job.riderName ?? 'Unknown rider'}` : 'No rider'}</Typography>
      <Mono sx={{ fontWeight: 600 }}>{job.vehicleId}</Mono>
    </Box>
  );
}

const ticket: Column<ServiceJob> = { key: 'ticket', header: 'Ticket', width: 90, render: (job) => <EntityId id={job.id} /> };
const repair: Column<ServiceJob> = { key: 'repair', header: 'Repair type', width: 120, render: (job) => REPAIR_TYPE_LABEL[job.repairType] };
const people: Column<ServiceJob> = { key: 'people', header: 'Created / Resolved by', width: 150, render: (job) => <People job={job} /> };
const status: Column<ServiceJob> = { key: 'status', header: 'Status', width: 140, render: (job) => <Stage job={job} /> };

const COLUMNS: Record<BoardKey, Column<ServiceJob>[]> = {
  'walk-in': [ticket, { key: 'rider', header: 'Rider / Vehicle', width: 200, render: (job) => <RiderVehicle job={job} /> }, repair, people, status],
  hub: [ticket, { key: 'vehicle', header: 'Vehicle', width: 110, render: (job) => <Mono sx={{ fontWeight: 600 }}>{job.vehicleId}</Mono> },
    { key: 'source', header: 'How it came in', width: 150, render: (job) => RETURN_SOURCE_LABEL[job.source] }, repair, people, status],
  all: [ticket, { key: 'category', header: 'Category', width: 100, render: (job) => (job.category === 'HUB' ? 'Hub' : 'Walk-in & RSA') },
    { key: 'rider', header: 'Rider / Vehicle', width: 200, render: (job) => <RiderVehicle job={job} /> }, repair, people, status],
};

/** What the search box looks in: the words an operator would type to find a card. */
function matches(job: ServiceJob, query: string) {
  if (!query) return true;
  const q = query.toLowerCase();
  return [job.id, job.vehicleId, job.riderId, job.riderName, job.technician, createdByOf(job)]
    .some((field) => field?.toLowerCase().includes(q));
}

/**
 * One board's job cards over the two category cards: the page behind is
 * blurred and inert until it closes. Search, status and the open board all
 * live in the address, so "Back to jobs" from a card returns to this view.
 */
export function BoardDialog({ board, jobs, pending, error, stage, query, onFilter, onClose, actionLabel, onAction, notice }: {
  board: BoardKey | null;
  /** Every job card on this board, already in board order. */
  jobs: ServiceJob[];
  pending: boolean;
  error?: string;
  stage: JobStage | null;
  query: string;
  onFilter: (next: { stage: JobStage | null; query: string }) => void;
  onClose: () => void;
  actionLabel?: string;
  onAction?: () => void;
  notice?: ReactNode;
}) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const mobile = fullScreen;
  const navigate = useNavigate();
  const [page, setPage] = useState({ key: '', index: 0 });
  if (!board) return <Dialog open={false} />;
  const meta = BOARD[board];

  const counts = Object.fromEntries(meta.stages.map((s) => [s, jobs.filter((j) => jobStage(j) === s).length])) as Record<JobStage, number>;
  const rows = jobs.filter((job) => (!stage || jobStage(job) === stage) && matches(job, query.trim()));
  // A new filter starts on page one; the page is keyed to the filter that produced it.
  const filterKey = `${board}|${stage ?? ''}|${query}`;
  const pageIndex = page.key === filterKey ? page.index : 0;
  const lastPage = Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1);
  const safePage = Math.min(pageIndex, lastPage);
  const pageRows = rows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const search = new URLSearchParams({ board, ...(stage ? { stage } : {}), ...(query ? { q: query } : {}) });
  const returnTo = `/service/queues?${search.toString()}`;
  const open = jobs.filter((j) => jobStage(j) !== 'CLOSED').length;
  const filtered = Boolean(stage || query);

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xl" fullScreen={fullScreen} scroll="paper" aria-labelledby="board-title"
      slotProps={{
        backdrop: { sx: { backdropFilter: 'blur(6px)', backgroundColor: 'rgba(8, 10, 20, 0.55)' } },
        paper: { sx: { height: { sm: '85vh' } } },
      }}>
      <DialogTitle id="board-title" component="div" sx={{ display: 'flex', alignItems: 'center', gap: 2, pr: 1.5, pb: 2 }}>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="overline" sx={{ display: 'block' }}>{meta.overline}</Typography>
          <Typography component="h2" sx={{ fontSize: { xs: 19, sm: 22 }, fontWeight: 600, lineHeight: 1.3 }}>{meta.title}</Typography>
          <Typography variant="body2" color="text.secondary">{jobs.length} job cards · {open} open</Typography>
        </Box>
        {actionLabel && onAction && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={onAction} sx={{ display: { xs: 'none', sm: 'inline-flex' } }}>{actionLabel}</Button>
        )}
        <IconButton aria-label="Close" onClick={onClose}><CloseIcon /></IconButton>
      </DialogTitle>

      {/* One line of controls: what to look for, and which status. */}
      <Box sx={{ px: { xs: 2, sm: 3 }, pb: 2, display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center' }}>
        <TextField size="small" placeholder="Search ticket, bike, rider or technician" value={query}
          onChange={(e) => onFilter({ stage, query: e.target.value })}
          slotProps={{
            htmlInput: { 'aria-label': 'Search job cards' },
            input: {
              startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
              endAdornment: query ? <InputAdornment position="end"><IconButton size="small" aria-label="Clear search" onClick={() => onFilter({ stage, query: '' })}><CloseIcon fontSize="small" /></IconButton></InputAdornment> : undefined,
            },
          }}
          sx={{ flex: { xs: '1 1 100%', md: '0 1 360px' } }} />
        <Box role="group" aria-label="Filter by status" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          <Chip label={`All · ${jobs.length}`} onClick={() => onFilter({ stage: null, query })}
            color={stage ? 'default' : 'primary'} variant={stage ? 'outlined' : 'filled'} aria-pressed={!stage} />
          {meta.stages.map((s) => (
            <Chip key={s} label={`${JOB_STAGE_LABEL[s]} · ${counts[s]}`} onClick={() => onFilter({ stage: stage === s ? null : s, query })}
              color={stage === s ? 'primary' : 'default'} variant={stage === s ? 'filled' : 'outlined'} aria-pressed={stage === s} />
          ))}
        </Box>
      </Box>

      <DialogContent dividers sx={{ px: { xs: 2, sm: 3 } }}>
        {notice}
        {actionLabel && onAction && (
          <Button fullWidth startIcon={<AddIcon />} onClick={onAction} sx={{ display: { xs: 'flex', sm: 'none' }, mb: 2 }}>{actionLabel}</Button>
        )}
        {pending ? <EmptyState title="Loading…" />
          : error ? <Alert severity="error">{error}</Alert>
          : !jobs.length ? <EmptyState title={meta.empty} />
          : !rows.length ? (
            <Box sx={{ textAlign: 'center', py: 6 }}>
              <Typography sx={{ fontWeight: 600 }}>No job cards match</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Try another word, or show every status.</Typography>
              <Button sx={{ mt: 2 }} onClick={() => onFilter({ stage: null, query: '' })}>Clear filters</Button>
            </Box>
          ) : <>
            {mobile ? (
              <Box sx={{ display: 'grid', gap: 1.5 }}>
                {pageRows.map((job) => (
                  <Box key={job.id} component={Link} to={jobPath(job)} state={{ returnTo }}
                    sx={{ display: 'block', border: 1, borderColor: 'divider', borderRadius: 2, p: 1.5, color: 'inherit', textDecoration: 'none' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                      <Mono sx={{ fontSize: 13 }}>{job.id} · {job.vehicleId}</Mono>
                      <StateChip label={JOB_STAGE_LABEL[jobStage(job)]} tone={JOB_STAGE_TONE[jobStage(job)]} />
                    </Box>
                    <Typography variant="body2" color="text.secondary" noWrap sx={{ mt: 0.75 }}>
                      {job.riderId ? `${job.riderName ?? job.riderId}` : RETURN_SOURCE_LABEL[job.source]} · {REPAIR_TYPE_LABEL[job.repairType]}
                    </Typography>
                  </Box>
                ))}
              </Box>
            ) : (
              <SimpleTable rows={pageRows} getRowKey={(job) => job.id} columns={COLUMNS[board]}
                rowSx={() => ({ cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } })}
                onRowClick={(job) => navigate(jobPath(job), { state: { returnTo } })} />
            )}
            <TableFooter page={safePage} pageSize={PAGE_SIZE} total={rows.length} onPageChange={(index) => setPage({ key: filterKey, index })}
              noun={filtered ? 'matching job cards' : 'job cards'} />
          </>}
      </DialogContent>
    </Dialog>
  );
}
