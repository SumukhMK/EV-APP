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
} from '../../../lib/labels';
import { RETURN_DESTINATIONS } from '../../../lib/serviceWorkflow';
import type { ReturnCondition } from '../../../types';

/**
 * The three fields every return asks: reason, date, and where the bike goes
 * next. Shared between exchange and deboard because those two screens ask an
 * identical question about the bike coming back, and the interesting logic —
 * default the next state from the condition and offer the four operational
 * destinations — should not be written twice and drift.
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
  condition,
}: {
  control: Control<T>;
  reasonName: Path<T>;
  reasonLabel: string;
  reasonOptions: readonly SelectOption[];
  dateName: Path<T>;
  dateLabel: string;
  nextStateName: Path<T>;
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
    const preferred = CONDITION_DEFAULT_STATE[condition];
    setValue(nextStateName, preferred as never);
  }, [condition, operatorTouched, nextStateName, setValue]);

  const nextStateOptions = RETURN_DESTINATIONS
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
        label="Where does the bike go next?"
        options={nextStateOptions}
      />
      <Box sx={{ color: 'text.secondary', fontSize: 13 }}>
        We suggest: {condition ? VEHICLE_STATE_LABEL[CONDITION_DEFAULT_STATE[condition]] : 'QC pending'}.
        You can pick any of the four. If you change it, say why in the notes before you confirm.
      </Box>
    </Box>
  );
}