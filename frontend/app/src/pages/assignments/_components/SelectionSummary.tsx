import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Mono } from '../../../components/Mono';
import { StateChip } from '../../../components/StateChip';
import { DefinitionList } from '../../../components/DefinitionList';
import { VEHICLE_STATE_LABEL, VEHICLE_STATE_TONE } from '../../../lib/labels';
import { rupeesWithSymbol } from '../../../lib/format';
import type { Paise, Rider, Vehicle } from '../../../types';

const DAY = 86_400_000;

/** Whole days since an ISO date, floor at zero. Kept out of the render body. */
function daysSince(iso: string) {
  return Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / DAY));
}

/**
 * What the operator needs to see the moment a rider is picked on the exchange
 * and deboard screens. All of it is read from the record, never typed — the
 * point of the summary is that the operator does not have to go look it up.
 *
 * The two screens ask different questions, so the rows differ:
 *   - exchange: the bike, where it is, what they pay, how long they have had it.
 *   - deboard: the bike, what they still owe, and what deposit is held against
 *     them — the two numbers the settlement is about to move.
 */
export function SelectionSummary({
  rider,
  vehicle,
  loading,
  variant = 'exchange',
  outstandingRent,
}: {
  rider?: Rider;
  vehicle?: Vehicle;
  loading?: boolean;
  variant?: 'exchange' | 'deboard';
  /** totalDue − amountPaid for the current period; positive means still owed. */
  outstandingRent?: Paise;
}) {
  if (!rider) {
    return (
      <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
        Search and select an active rider.
      </Typography>
    );
  }

  const daysOnBike = rider.currentVehicleId ? daysSince(rider.onboardedOn) : 0;

  const exchangeItems = [
    {
      label: 'Current vehicle',
      value: (
        <Mono sx={{ fontSize: 13 }}>{rider.currentVehicleId ?? 'No bike assigned'}</Mono>
      ),
    },
    {
      label: 'Vehicle state',
      value: vehicle ? (
        <StateChip
          label={VEHICLE_STATE_LABEL[vehicle.state]}
          tone={VEHICLE_STATE_TONE[vehicle.state]}
        />
      ) : loading ? (
        'Loading…'
      ) : (
        '—'
      ),
    },
    {
      label: 'Weekly plan',
      value: <Mono sx={{ fontSize: 13 }}>{rupeesWithSymbol(rider.planAmount)}</Mono>,
    },
    {
      label: 'Days on this bike',
      value: rider.currentVehicleId ? `${daysOnBike} day${daysOnBike === 1 ? '' : 's'}` : '—',
    },
  ];

  const deboardItems = [
    {
      label: 'Bike returned',
      value: (
        <Mono sx={{ fontSize: 13 }}>{rider.currentVehicleId ?? 'No bike assigned'}</Mono>
      ),
    },
    {
      label: 'Outstanding rent',
      value: (
        <Mono sx={{ fontSize: 13 }}>
          {outstandingRent === undefined ? 'Loading…' : rupeesWithSymbol(outstandingRent)}
        </Mono>
      ),
    },
    {
      label: 'Deposit held',
      value: <Mono sx={{ fontSize: 13 }}>{rupeesWithSymbol(rider.depositHeld)}</Mono>,
    },
  ];

  return (
    <Box>
      <DefinitionList
        divider="top"
        columns={2}
        items={variant === 'deboard' ? deboardItems : exchangeItems}
      />
    </Box>
  );
}