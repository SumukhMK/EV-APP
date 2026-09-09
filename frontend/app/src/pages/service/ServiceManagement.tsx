import Box from '@mui/material/Box';
import { useQuery } from '@tanstack/react-query';
import HandymanIcon from '@mui/icons-material/HandymanOutlined';
import BuildIcon from '@mui/icons-material/BuildOutlined';
import ReportProblemIcon from '@mui/icons-material/ReportProblemOutlined';
import CarCrashIcon from '@mui/icons-material/CarCrashOutlined';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUserOutlined';
import ShieldIcon from '@mui/icons-material/ShieldOutlined';
import Inventory2Icon from '@mui/icons-material/Inventory2Outlined';
import FactCheckIcon from '@mui/icons-material/FactCheckOutlined';
import StorefrontIcon from '@mui/icons-material/StorefrontOutlined';
import SupportAgentIcon from '@mui/icons-material/SupportAgentOutlined';
import BoltIcon from '@mui/icons-material/BoltOutlined';
import { PageHeader } from '../../components/PageHeader';
import { QueueBox } from '../../components/QueueBox';
import { InfoStrip } from '../../components/InfoStrip';
import { getServiceQueues } from '../../lib/api/dashboard';

/**
 * Screen 22 — the workshop at a glance: seven kinds of repair on one side,
 * three sources of a live service call on the other, each row carrying its
 * count into the list that produced it.
 *
 * Only the rows a real state backs — QC pending, accident — get their own
 * filter. The repair sub-kinds and the service sources are not separately
 * filterable on the vehicle list yet, so they open the full Under-repair list
 * rather than a filter the list would silently ignore. The note says which.
 */
export function ServiceManagement() {
  const queues = useQuery({ queryKey: ['service', 'queues'], queryFn: getServiceQueues });
  const q = queues.data;

  const underRepairRows = [
    { label: 'Minor repair', count: q?.underRepair.minor ?? 0, icon: BuildIcon, to: '/vehicles?state=UNDER_REPAIR' },
    { label: 'Major repair', count: q?.underRepair.major ?? 0, tone: 'warn' as const, icon: ReportProblemIcon, to: '/vehicles?state=UNDER_REPAIR' },
    { label: 'Accident', count: q?.underRepair.accident ?? 0, tone: 'bad' as const, icon: CarCrashIcon, to: '/vehicles?state=ACCIDENT' },
    { label: 'Warranty', count: q?.underRepair.warranty ?? 0, icon: VerifiedUserIcon, to: '/vehicles?state=UNDER_REPAIR' },
    { label: 'Insurance', count: q?.underRepair.insurance ?? 0, icon: ShieldIcon, to: '/vehicles?state=UNDER_REPAIR' },
    { label: 'Parts awaiting', count: q?.underRepair.partsWaiting ?? 0, tone: 'caution' as const, icon: Inventory2Icon, to: '/vehicles?state=UNDER_REPAIR' },
    { label: 'QC pending', count: q?.underRepair.qcPending ?? 0, tone: 'caution' as const, icon: FactCheckIcon, to: '/vehicles?state=QC_PENDING' },
  ];

  const inServiceRows = [
    { label: 'Walk-in', count: q?.inService.walkIn ?? 0, icon: StorefrontIcon, to: '/vehicles?state=UNDER_REPAIR' },
    { label: 'Roadside assistance', count: q?.inService.rsa ?? 0, icon: SupportAgentIcon, to: '/vehicles?state=UNDER_REPAIR' },
    { label: 'Quick response team', count: q?.inService.qrt ?? 0, icon: BoltIcon, to: '/vehicles?state=UNDER_REPAIR' },
  ];

  return (
    <>
      <PageHeader section="Fleet" title="Service queues" icon={HandymanIcon} />

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
          gap: 5,
          mt: 5,
          alignItems: 'start',
        }}
      >
        <QueueBox heading="Under repair" rows={underRepairRows} />
        <QueueBox heading="In service" rows={inServiceRows} />
      </Box>

      <Box sx={{ mt: 5 }}>
        <InfoStrip tone="caution">
          Only QC pending and Accident have their own state filter. The repair sub-kinds (minor,
          major, warranty, insurance, parts-awaiting) and the three service sources are not yet
          separately filterable, so those rows open the full Under-repair list.
        </InfoStrip>
      </Box>
    </>
  );
}
