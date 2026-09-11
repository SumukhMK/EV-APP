import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import TodayIcon from '@mui/icons-material/TodayOutlined';
import RocketIcon from '@mui/icons-material/RocketLaunchOutlined';
import SwapIcon from '@mui/icons-material/SwapHorizOutlined';
import AssignmentReturnIcon from '@mui/icons-material/AssignmentReturnedOutlined';
import ReplayIcon from '@mui/icons-material/ReplayCircleFilledOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircleOutlined';
import BuildIcon from '@mui/icons-material/BuildOutlined';
import FactCheckIcon from '@mui/icons-material/FactCheckOutlined';
import CarCrashIcon from '@mui/icons-material/CarCrashOutlined';
import SupportAgentIcon from '@mui/icons-material/SupportAgentOutlined';
import StorefrontIcon from '@mui/icons-material/StorefrontOutlined';
import BoltIcon from '@mui/icons-material/BoltOutlined';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { StatTiles } from '../../components/StatTiles';
import { InfoStrip } from '../../components/InfoStrip';
import { PeriodToggle } from '../../components/PeriodToggle';
import { ScaleMeter } from '../../components/ScaleMeter';
import { Mono } from '../../components/Mono';
import { resolvePeriod, type PeriodGrain } from '../../lib/period';
import { getFleetSummary, getHubUtilisation, getOperationsSummary } from '../../lib/api/dashboard';
import { formatNumber } from '../../lib/format';
import { neutral } from '../../theme/tokens';

/**
 * Screen 21 — what moved in a period, where it landed, and where the service
 * demand came from. The period toggle is the whole point: the same three
 * strips answer the question for a day, a Wednesday→Tuesday week, or a month,
 * and the figures move with the range.
 *
 * The tiles link to the fleet state that matches them where one exists. They
 * do not carry the period into the list — the vehicles list is not yet
 * period-scoped, and a link that silently ignores its own range would be worse
 * than one that admits it, so the note below says which.
 */
export function TodayOperations() {
  const [period, setPeriod] = useState<{ grain: PeriodGrain; anchorIso: string }>({
    grain: 'DAY',
    anchorIso: '2026-09-09',
  });

  const resolved = resolvePeriod(period.grain, period.anchorIso);

  const summary = useQuery({
    queryKey: ['operations', 'summary', resolved.startIso, resolved.endIso],
    queryFn: () => getOperationsSummary(resolved.startIso, resolved.endIso),
    placeholderData: keepPreviousData,
  });

  // The outcome strip reads the live fleet, not the period, because those
  // tiles link to a filtered vehicle list and a tile must agree with the list
  // it opens. Movement and source stay period figures and therefore do not
  // link anywhere — there is no period-scoped list for them to be honest about.
  const fleet = useQuery({ queryKey: ['dashboard', 'summary'], queryFn: getFleetSummary });

  // Utilisation is a fleet figure, not a period one — it answers "is stock
  // sitting idle right now", which a date range would only obscure.
  const utilisation = useQuery({ queryKey: ['dashboard', 'utilisation'], queryFn: getHubUtilisation });

  const s = summary.data;
  const f = fleet.data;
  const n = (v: number | undefined) => (v === undefined ? '—' : formatNumber(v));

  return (
    <>
      <PageHeader
        section="Operations"
        title="Today's operations"
        icon={TodayIcon}
        meta={<Mono sx={{ fontSize: 12, color: neutral[500] }}>{resolved.label}</Mono>}
      />

      <Panel label="Period" subtitle={resolved.label} sx={{ mt: 5 }}>
        <PeriodToggle grain={period.grain} anchorIso={period.anchorIso} onChange={setPeriod} />
      </Panel>

      <Panel label="Vehicle movement" subtitle={`Events in ${resolved.label}`} sx={{ mt: 5 }}>
        <StatTiles
          tiles={[
            { label: 'Deployed', value: n(s?.movement.deployed), icon: RocketIcon },
            { label: 'Exchanged', value: n(s?.movement.exchanged), icon: SwapIcon },
            { label: 'Returned', value: n(s?.movement.returned), icon: AssignmentReturnIcon },
            {
              label: 'Recovered',
              value: n(s?.movement.recovered),
              tone: 'warn',
              icon: ReplayIcon,
            },
          ]}
        />
      </Panel>

      <Panel label="Vehicle outcome" subtitle="The fleet right now" sx={{ mt: 5 }}>
        <StatTiles
          tiles={[
            {
              label: 'Ready to deploy',
              value: n(f?.readyToDeploy),
              tone: 'good',
              icon: CheckCircleIcon,
              to: '/vehicles?state=READY_TO_DEPLOY',
            },
            {
              label: 'Under repair',
              value: n(f?.underRepair),
              tone: 'warn',
              icon: BuildIcon,
              to: '/vehicles?state=UNDER_REPAIR',
            },
            {
              label: 'QC pending',
              value: n(f?.qcPending),
              tone: 'caution',
              icon: FactCheckIcon,
              to: '/vehicles?state=QC_PENDING',
            },
            {
              label: 'Accident',
              value: n(f?.accident),
              tone: 'bad',
              icon: CarCrashIcon,
              to: '/vehicles?state=ACCIDENT',
            },
          ]}
        />
      </Panel>

      <Panel label="Service source" subtitle={`Events in ${resolved.label}`} sx={{ mt: 5 }}>
        <StatTiles
          tiles={[
            { label: 'Roadside assistance', value: n(s?.source.rsa), icon: SupportAgentIcon },
            { label: 'Walk-in', value: n(s?.source.walkIn), icon: StorefrontIcon },
            { label: 'Quick response team', value: n(s?.source.qrt), icon: BoltIcon },
          ]}
        />
      </Panel>

      <Panel
        label="Hub utilisation"
        subtitle="Deployed as a share of what each hub holds. The band is derived from the figure, so the bar and the label can never disagree."
        sx={{ mt: 5 }}
      >
        {utilisation.isLoading ? (
          <Typography sx={{ fontSize: 13, color: neutral[500] }}>Loading…</Typography>
        ) : (
          <Box sx={{ display: 'grid', gap: 5 }}>
            {(utilisation.data ?? []).map((h) => (
              <ScaleMeter
                key={h.hub}
                label={h.hub}
                percent={h.percent}
                caption={`${h.deployed} deployed · ${h.idle} idle · ${h.total} held`}
              />
            ))}
          </Box>
        )}
      </Panel>

      <Box sx={{ mt: 5 }}>
        <InfoStrip tone="caution">
          Movement and service source count events inside the selected period, so they change with
          the toggle and do not link anywhere — there is no period-scoped vehicle list yet. Vehicle
          outcome is the fleet as it stands now, which is why those tiles open a list that matches
          them exactly.
        </InfoStrip>
      </Box>
    </>
  );
}
