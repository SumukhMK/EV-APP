import { useEffect } from 'react';
import Box from '@mui/material/Box';
import {
  useFormContext,
  type Control,
  type FieldValues,
  type Path,
} from 'react-hook-form';
import { SelectField, type SelectOption } from '../../../components/form/SelectField';
import { DateField } from '../../../components/form/DateField';
import {
  CONDITION_DEFAULT_STATE,
  VEHICLE_STATE_LABEL,
  VEHICLE_TRANSITIONS,
} from '../../../lib/labels';
import type { ReturnCondition, VehicleState } from '../../../types';

/**
 * The three fields every return asks: reason, date, and where the bike goes
 * next. Shared between exchange and deboard because those two screens ask an
 * identical question about the bike coming back, and the interesting logic —
 * default the next state from the condition, then bound the choices by the
 * vehicle transitions — should not be written twice and drift.
 *
 * Recovery is deliberately not offered: the prototype's scope decision, stated
 * on both screens, is that recovery is not part of the exchange/deboard flow.
 *
 * The parent must wrap the form in `FormProvider` — the default next state is
 * written with `setValue`, which needs the form context.
 */
export function DispositionFields<T extends FieldValues>({
  control,
  reasonName,
  reasonLabel,
  reasonOptions,
  dateName,
  dateLabel,
  nextStateName,
  currentState,
  condition,
}: {
  control: Control<T>;
  reasonName: Path<T>;
  reasonLabel: string;
  reasonOptions: readonly SelectOption[];
  dateName: Path<T>;
  dateLabel: string;
  nextStateName: Path<T>;
  /** The state the bike is in now — bounds the offered transitions. */
  currentState: VehicleState;
  /** Drives the default next state; the operator can still override. */
  condition?: ReturnCondition;
}) {
  const { formState, setValue, watch } = useFormContext();

  const dateError = formState.errors[dateName as string] as { message?: string } | undefined;

  // RHF's dirty flag is the "operator touched it" signal: setValue does not
  // mark a field dirty, so a programmatic default never blocks a later one,
  // and a deliberate override is never clobbered.
  const operatorTouched = Boolean(
    (formState.dirtyFields as Record<string, boolean>)[nextStateName as string],
  );

  useEffect(() => {
    if (operatorTouched || !condition) return;
    const offered: VehicleState[] = VEHICLE_TRANSITIONS[currentState].filter((s) => s !== 'RECOVERY');
    const preferred = CONDITION_DEFAULT_STATE[condition];
    const legal = offered.includes(preferred) ? preferred : offered[0];
    if (legal) setValue(nextStateName, legal as never);
  }, [condition, operatorTouched, currentState, nextStateName, setValue]);

  const nextStateOptions = VEHICLE_TRANSITIONS[currentState]
    .filter((s) => s !== 'RECOVERY')
    .map((s) => ({ value: s, label: VEHICLE_STATE_LABEL[s] }));

  return (
    <Box sx={{ display: 'grid', gap: 5 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 5 }}>
        <SelectField control={control} name={reasonName} label={reasonLabel} options={reasonOptions} />
        <DateField
          label={dateLabel}
          value={(watch(dateName) as string) ?? ''}
          onChange={(next) => setValue(dateName, next as never, { shouldValidate: true })}
          error={Boolean(dateError)}
          helperText={dateError?.message}
        />
      </Box>
      <SelectField
        control={control}
        name={nextStateName}
        label="Next vehicle state"
        options={nextStateOptions}
      />
    </Box>
  );
}