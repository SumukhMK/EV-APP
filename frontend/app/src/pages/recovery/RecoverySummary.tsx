import Box from '@mui/material/Box';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '../../components/PageHeader';
import { QueueBox } from '../../components/QueueBox';
import { InfoStrip } from '../../components/InfoStrip';
import { getRecoveryCounts } from '../../lib/api/dashboard';

/**
 * Screen 23 — the recovery board. Two of the "need to recover" rows are a
 * money problem (a rider behind on rent) and lead to the overdue list; the
 * rest are a location problem (where the bike physically is) and lead to the
 * recovery state on the vehicle list.
 *
 * "Missing" has no state of its own in the registry yet — it is counted under
 * recovery and the note says so, because an honest gap beats a fabricated
 * state that the vehicles list could not actually produce.
 */
export function RecoverySummary() {
  const counts = useQuery({ queryKey: ['recovery', 'counts'], queryFn: getRecoveryCounts });
  const c = counts.data;

  const needRows = [
    { label: 'Partially paid', count: c?.needToRecover.partiallyPaid ?? 0, tone: 'caution' as const, to: '/payments/overdue' },
    { label: 'Not paid', count: c?.needToRecover.notPaid ?? 0, tone: 'bad' as const, to: '/payments/overdue' },
    { label: 'Left at roadside', count: c?.needToRecover.leftAtRoadside ?? 0, tone: 'warn' as const, to: '/vehicles?state=RECOVERY' },
    { label: 'Vehicle missing', count: c?.needToRecover.missing ?? 0, tone: 'bad' as const, to: '/vehicles?state=RECOVERY' },
    { label: 'Accident', count: c?.needToRecover.accident ?? 0, tone: 'bad' as const, to: '/vehicles?state=ACCIDENT' },
  ];

  const recoveredRows = [
    { label: 'Recovered', count: c?.recovered.recovered ?? 0, tone: 'good' as const, to: '/vehicles?state=RECOVERY' },
  ];

  return (
    <>
      <PageHeader section="Money" title="Recovery" />

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
          gap: 5,
          mt: 5,
          alignItems: 'start',
        }}
      >
        <QueueBox heading="Need to recover" rows={needRows} />
        <QueueBox heading="Recovered" rows={recoveredRows} />
      </Box>

      <Box sx={{ mt: 5 }}>
        <InfoStrip tone="caution">
          Partially paid and not paid open the overdue list; the location rows open the recovery
          state on the vehicle list. "Vehicle missing" has no state of its own yet, so it is counted
          under recovery until the registry can hold it.
        </InfoStrip>
      </Box>
    </>
  );
}
