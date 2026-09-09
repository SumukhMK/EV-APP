import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import SpeedIcon from '@mui/icons-material/SpeedOutlined';
import TwoWheelerIcon from '@mui/icons-material/TwoWheelerOutlined';
import RocketIcon from '@mui/icons-material/RocketLaunchOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircleOutlined';
import BuildIcon from '@mui/icons-material/BuildOutlined';
import FactCheckIcon from '@mui/icons-material/FactCheckOutlined';
import PeopleAlertIcon from '@mui/icons-material/PersonOffOutlined';
import CurrencyRupeeIcon from '@mui/icons-material/CurrencyRupeeOutlined';
import { PageHeader } from '../components/PageHeader';
import { Panel } from '../components/Panel';
import { StatTiles } from '../components/StatTiles';
import { BarChart } from '../components/BarChart';
import { DefinitionList } from '../components/DefinitionList';
import { StateChip } from '../components/StateChip';
import { Mono } from '../components/Mono';
import { getFleetSummary, getMonthlyDeployments } from '../lib/api/dashboard';
import { formatNumber, rupees } from '../lib/format';
import { neutral } from '../theme/tokens';

const MONTH_LABEL = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const now = new Intl.DateTimeFormat('en-IN', {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

export function Dashboard() {
  const summary = useQuery({ queryKey: ['dashboard', 'summary'], queryFn: getFleetSummary });
  const deployments = useQuery({ queryKey: ['dashboard', 'deployments'], queryFn: getMonthlyDeployments });

  const s = summary.data;
  const bars = (deployments.data ?? []).map((d) => ({
    label: MONTH_LABEL[Number(d.month.slice(5, 7)) - 1],
    value: d.count,
  }));
  const mean = bars.length ? bars.reduce((t, b) => t + b.value, 0) / bars.length : 0;
  const peak = bars.reduce((m, b) => Math.max(m, b.value), 0);

  return (
    <>
      <PageHeader
        section="Operations"
        title="Dashboard"
        icon={SpeedIcon}
        meta={
          <Mono sx={{ fontSize: 12, color: neutral[500] }}>{now.format(new Date())}</Mono>
        }
      />

      <Box sx={{ mt: 4.5 }}>
        {/*
          Every tile leads to the set it counts. The four fleet-state tiles go
          to the vehicles list pre-filtered on that state, so the figure and
          the list can be reconciled in one click. Under repair used to open
          the inspection form, which is where a bike is *sent* to repair, not
          where the nine already there can be seen.
        */}
        <StatTiles
          tiles={[
            { label: 'Total fleet', value: s ? formatNumber(s.totalFleet) : '—', icon: TwoWheelerIcon, to: '/vehicles' },
            {
              label: 'Deployed',
              value: s ? formatNumber(s.deployed) : '—',
              icon: RocketIcon,
              to: '/vehicles?state=DEPLOYED',
            },
            {
              label: 'Ready',
              value: s ? formatNumber(s.readyToDeploy) : '—',
              tone: 'good',
              icon: CheckCircleIcon,
              to: '/vehicles?state=READY_TO_DEPLOY',
            },
            {
              label: 'Under repair',
              value: s ? formatNumber(s.underRepair) : '—',
              tone: 'warn',
              icon: BuildIcon,
              to: '/vehicles?state=UNDER_REPAIR',
            },
            {
              label: 'QC pending',
              value: s ? formatNumber(s.qcPending) : '—',
              tone: 'caution',
              icon: FactCheckIcon,
              to: '/vehicles?state=QC_PENDING',
            },
            {
              label: 'Overdue riders',
              value: s ? formatNumber(s.overdueRiders) : '—',
              tone: 'bad',
              icon: PeopleAlertIcon,
              to: '/payments/overdue',
            },
            {
              label: 'Overdue value',
              value: s ? rupees(s.overdueValue) : '—',
              tone: 'bad',
              icon: CurrencyRupeeIcon,
              to: '/payments/overdue',
            },
          ]}
        />
      </Box>

      <Panel
        label="Deployments per month"
        subtitle="Aug 2025 — Aug 2026 · 13 months"
        sx={{ mt: 5 }}
        action={
          <Mono sx={{ fontSize: 12, color: neutral[500] }}>
            peak {peak} · mean {mean.toFixed(1)}
          </Mono>
        }
      >
        {bars.length > 0 && <BarChart bars={bars} />}
      </Panel>

      <Panel
        label="Service & inventory"
        sx={{ mt: 5, borderStyle: 'dashed', borderColor: neutral[800], opacity: 0.55 }}
        action={<StateChip label="Phase 2" tone="neutral" />}
      >
        <DefinitionList
          columns={2}
          items={[
            { label: 'Open job cards', value: '—' },
            { label: 'Parts awaiting', value: '—' },
            { label: 'Stock value', value: '—' },
            { label: 'Service cost / week', value: '—' },
          ]}
        />
        <Typography sx={{ fontSize: 12, color: neutral[500], mt: 3 }}>
          Shown so the shape of phase 2 is visible. No data behind it yet.
        </Typography>
      </Panel>
    </>
  );
}
