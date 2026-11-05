import BuildIcon from '@mui/icons-material/BuildOutlined';
import HandymanIcon from '@mui/icons-material/HandymanOutlined';
import SearchIcon from '@mui/icons-material/SearchOutlined';
import WarehouseIcon from '@mui/icons-material/WarehouseOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useSession } from '../../app/sessionContext';
import { PageHeader } from '../../components/PageHeader';
import { TOUR_ANCHORS, tourAnchor } from '../../tour/anchors';
import { listServiceJobs } from '../../lib/api/serviceJobs';
import { canManageService } from '../../lib/roles';
import { JOB_STAGE_LABEL, jobStage, type JobStage } from '../../lib/serviceWorkflow';
import type { ServiceJob } from '../../types';
import { BoardDialog, type BoardKey } from './jobCards/BoardDialog';
import { CategoryCard, type BoardStat } from './jobCards/CategoryCard';
import { HubJobCardDialog } from './jobCards/HubJobCardDialog';
import { WalkInJobCardDialog } from './jobCards/WalkInJobCardDialog';

const BOARDS: BoardKey[] = ['walk-in', 'hub', 'all'];
const STAGES: JobStage[] = ['UNDER_REPAIR', 'PARTS_WAITING', 'QC_PENDING', 'CLOSED'];

/** Open cards first, newest first inside each half — closed work is reference. */
function board(jobs: ServiceJob[]) {
  return [...jobs].sort((a, b) =>
    Number(a.status === 'CLOSED') - Number(b.status === 'CLOSED') || b.createdOn.localeCompare(a.createdOn));
}

export function ServiceManagement() {
  const { user } = useSession();
  const canWork = canManageService(user.roleKey);
  const jobs = useQuery({ queryKey: ['service-jobs', 'list'], queryFn: () => listServiceJobs() });
  const [params, setParams] = useSearchParams();
  const openBoard = BOARDS.find((b) => b === params.get('board')) ?? null;
  const stage = STAGES.find((st) => st === params.get('stage')) ?? null;
  const query = params.get('q') ?? '';
  const show = (next: { board: BoardKey | null; stage?: JobStage | null; query?: string }) => {
    const p = new URLSearchParams();
    if (next.board) p.set('board', next.board);
    if (next.board && next.stage) p.set('stage', next.stage);
    if (next.board && next.query) p.set('q', next.query);
    setParams(p, { replace: true });
  };
  const [dialog, setDialog] = useState<'WALK_IN_RSA' | 'HUB' | null>(null);
  const [created, setCreated] = useState('');

  const all = board(jobs.data ?? []);
  const walkInJobs = all.filter((j) => j.category === 'WALK_IN_RSA');
  const hubJobs = all.filter((j) => j.category === 'HUB');
  const stat = (rows: ServiceJob[], key: BoardKey, s: JobStage): BoardStat =>
    ({ label: JOB_STAGE_LABEL[s], value: rows.filter((j) => jobStage(j) === s).length, onClick: () => show({ board: key, stage: s }) });
  const walkInStats = (['UNDER_REPAIR', 'QC_PENDING', 'CLOSED'] as const).map((s) => stat(walkInJobs, 'walk-in', s));
  const hubStats = (['UNDER_REPAIR', 'PARTS_WAITING', 'QC_PENDING'] as const).map((s) => stat(hubJobs, 'hub', s));

  const onCreated = (job: ServiceJob) => { setDialog(null); setCreated(`Job card ${job.id} opened for ${job.vehicleId}.`); };
  const listError = jobs.isError ? jobs.error.message : undefined;
  const createdAlert = created && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setCreated('')}>{created}</Alert>;
  const boardJobs = openBoard === 'walk-in' ? walkInJobs : openBoard === 'hub' ? hubJobs : all;
  const boardAction = !canWork || openBoard === 'all' || !openBoard ? undefined
    : openBoard === 'hub' ? { label: 'Open Hub Job Card', run: () => setDialog('HUB') }
    : { label: 'Open Job Card', run: () => setDialog('WALK_IN_RSA') };

  return (
    <>
      <PageHeader section="Service management" title="Job Card Management" icon={HandymanIcon}
        actions={
          <Button
            variant="contained"
            color="primary"
            size="large"
            startIcon={<SearchIcon />}
            {...tourAnchor(TOUR_ANCHORS.serviceAllJobCards)}
            onClick={() => show({ board: 'all' })}
            sx={{
              fontWeight: 700,
              boxShadow: 2,
              '&:hover': { boxShadow: 4 },
            }}
          >
            All job cards
          </Button>
        }
      />
      {!canWork && <Alert severity="info" sx={{ mt: 3 }}>View only — you cannot open or move job cards.</Alert>}
      {!openBoard && createdAlert && <Box sx={{ mt: 3 }}>{createdAlert}</Box>}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }, gap: { xs: 3, md: 4 }, mt: 4, alignItems: 'stretch' }}>
        <CategoryCard
          overline="CATEGORY 01"
          title="Walk-in & RSA"
          description="Open a job card for an active rider's vehicle serviced by Walk-in or RSA."
          icon={BuildIcon}
          stats={walkInStats}
          total={walkInJobs.length}
          actionLabel={canWork ? 'Open Job Card' : undefined}
          onAction={() => setDialog('WALK_IN_RSA')}
          onOpen={() => show({ board: 'walk-in' })}
        />
        <CategoryCard
          overline="CATEGORY 02"
          title="Hub Service"
          description="Only inactive vehicles returned by riders or recovered from riders. No rider selection. Track repair, parts and QC."
          icon={WarehouseIcon}
          stats={hubStats}
          total={hubJobs.length}
          actionLabel={canWork ? 'Open Hub Job Card' : undefined}
          onAction={() => setDialog('HUB')}
          onOpen={() => show({ board: 'hub' })}
        />
      </Box>

      <BoardDialog board={openBoard} jobs={boardJobs} pending={jobs.isPending} error={listError}
        stage={stage} query={query} onFilter={(f) => show({ board: openBoard, ...f })} onClose={() => show({ board: null })}
        actionLabel={boardAction?.label} onAction={boardAction?.run} notice={openBoard ? createdAlert : undefined} />

      <WalkInJobCardDialog open={dialog === 'WALK_IN_RSA'} onClose={() => setDialog(null)} onCreated={onCreated} />
      <HubJobCardDialog open={dialog === 'HUB'} onClose={() => setDialog(null)} onCreated={onCreated} />
    </>
  );
}
