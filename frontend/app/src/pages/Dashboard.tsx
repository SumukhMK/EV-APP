import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();
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
        meta={
          <Mono sx={{ fontSize: 12, color: neutral[500] }}>{now.format(new Date())}</Mono>
        }
      />

      <Box sx={{ mt: 4.5 }}>
        <StatTiles
          tiles={[
            { label: 'Total fleet', value: s ? formatNumber(s.totalFleet) : '—', onClick: () => navigate('/vehicles') },
            { label: 'Deployed', value: s ? formatNumber(s.deployed) : '—', onClick: () => navigate('/vehicles') },
            { label: 'Ready', value: s ? formatNumber(s.readyToDeploy) : '—', tone: 'good', onClick: () => navigate('/vehicles') },
            { label: 'Under repair', value: s ? formatNumber(s.underRepair) : '—', tone: 'warn', onClick: () => navigate('/inspections') },
            { label: 'QC pending', value: s ? formatNumber(s.qcPending) : '—', tone: 'caution', onClick: () => navigate('/qc') },
            { label: 'Overdue riders', value: s ? formatNumber(s.overdueRiders) : '—', tone: 'bad', onClick: () => navigate('/payments/overdue') },
            { label: 'Overdue value', value: s ? rupees(s.overdueValue) : '—', tone: 'bad', onClick: () => navigate('/payments/overdue') },
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
