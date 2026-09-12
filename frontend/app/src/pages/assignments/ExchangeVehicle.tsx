import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import TextField from '@mui/material/TextField';
import { Controller, FormProvider, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { Mono } from '../../components/Mono';
import { DefinitionList } from '../../components/DefinitionList';
import { EmptyState } from '../../components/EmptyState';
import { InfoStrip } from '../../components/InfoStrip';
import { SelectField } from '../../components/form/SelectField';
import { VehiclePicker } from './VehiclePicker';
import { RiderSearchSelect } from './_components/RiderSearchSelect';
import { SelectionSummary } from './_components/SelectionSummary';
import { DispositionFields } from './_components/DispositionFields';
import { exchangeVehicle } from '../../lib/api/assignments';
import { listAssignedRiders } from '../../lib/api/riders';
import { getVehicle } from '../../lib/api/vehicles';
import { ApiError } from '../../lib/api/client';
import { invalidateAssignments } from '../../lib/invalidate';
import {
  exchangeVehicleSchema,
  today,
  type ExchangeVehicleValues,
} from '../../lib/schemas/assignment';
import {
  EXCHANGE_REASON_LABEL,
  RETURN_CONDITION_LABEL,
  VEHICLE_STATE_LABEL,
} from '../../lib/labels';
import { layout } from '../../theme/tokens';
import type { ExchangeReason } from '../../types';

const REASONS = (Object.keys(EXCHANGE_REASON_LABEL) as ExchangeReason[]).map((r) => ({
  value: r,
  label: EXCHANGE_REASON_LABEL[r],
}));

const CONDITIONS = (['NONE', 'MINOR', 'MAJOR', 'ACCIDENT'] as const).map((c) => ({
  value: c,
  label: RETURN_CONDITION_LABEL[c],
}));

/**
 * Screen 11. Two recorded events, never an overwrite: the old assignment
 * closes with a condition and a new one opens.
 *
 * The condition on the returned bike is the point of the screen. The
 * spreadsheet's swap just rewrote the rider's vehicle column, which is how a
 * bike with a bent fork ended up back in the yard as available. Here the bike
 * coming back takes the same route a deboarded one does — and the operator
 * can override the routing, because the prototype says they routinely do.
 */
export function ExchangeVehicle() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const [banner, setBanner] = useState<string | null>(null);

  const riders = useQuery({
    queryKey: ['riders', 'assigned'],
    queryFn: listAssignedRiders,
  });

  const form = useForm<ExchangeVehicleValues>({
    resolver: zodResolver(exchangeVehicleSchema),
    defaultValues: {
      riderId: params.get('riderId') ?? '',
      fromVehicleId: '',
      toVehicleId: '',
      occurredOn: today(),
      reason: 'BREAKDOWN',
      returnCondition: 'NONE',
      // The condition default for a DEPLOYED bike with no damage is RETURNED;
      // DispositionFields re-derives it from the condition on mount.
      nextVehicleState: 'RETURNED',
      note: '',
    },
    mode: 'onBlur',
  });

  const picked = useWatch({ control: form.control });
  const rider = riders.data?.find((r) => r.id === picked.riderId);

  // The bike being handed back is not a choice — it is whichever one the rider
  // is holding. It lives in the form all the same, so the request carries what
  // the UI believed and the server can reject a stale one.
  useEffect(() => {
    const held = rider?.currentVehicleId ?? '';
    if (picked.fromVehicleId !== held) {
      form.setValue('fromVehicleId', held, { shouldValidate: Boolean(held) });
      // A bike that was picked as the replacement cannot also be the one going
      // back, so a rider switch clears it.
      if (picked.toVehicleId === held) form.setValue('toVehicleId', '');
    }
  }, [rider, picked.fromVehicleId, picked.toVehicleId, form]);

  const bike = useQuery({
    queryKey: ['vehicle', rider?.currentVehicleId],
    queryFn: () => getVehicle(rider!.currentVehicleId!),
    enabled: Boolean(rider?.currentVehicleId),
  });

  const save = useMutation({
    mutationFn: (values: ExchangeVehicleValues) => exchangeVehicle(values),
    onSuccess: () => invalidateAssignments(queryClient),
    onError: (error) => {
      if (error instanceof ApiError && error.field) {
        form.setError(error.field as keyof ExchangeVehicleValues, { message: error.message });
      } else {
        setBanner(error instanceof Error ? error.message : 'Could not record the exchange');
      }
    },
  });

  const submit = form.handleSubmit(async (values) => {
    setBanner(null);
    const updated = await save.mutateAsync(values);
    navigate(`/riders/${updated.id}`);
  });

  if (riders.isLoading) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 320 }}>
        <CircularProgress size={22} />
      </Box>
    );
  }

  if ((riders.data ?? []).length === 0) {
    return (
      <>
        <PageHeader section="Riders" title="Exchange vehicle" />
        <EmptyState
          title="No rider is holding a bike"
          description="An exchange swaps one bike for another, so it needs a rider who already has one. Assign a bike first."
          action={
            <Button component={Link} to="/assignments/assign">
              Assign a bike
            </Button>
          }
        />
      </>
    );
  }

  return (
    <FormProvider {...form}>
      <Box component="form" onSubmit={submit} noValidate>
        <PageHeader
          section="Riders"
          title="Exchange vehicle"
          actions={
            <>
              <Button color="inherit" component={Link} to="/riders">
                Cancel
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? 'Recording…' : 'Record exchange'}
              </Button>
            </>
          }
        />

        {banner && (
          <Alert severity="error" variant="outlined" sx={{ mt: 5 }}>
            {banner}
          </Alert>
        )}

        <Box sx={{ display: 'grid', gap: 5, mt: 5, '& > *': { minWidth: 0 } }}>
          <Panel
            label="Current assignment"
            subtitle="Only riders who currently have a bike."
            sx={{ maxWidth: layout.readingMax }}
          >
            <RiderSearchSelect
              label="Rider"
              placeholder="Search by name, rider id, phone or bike id"
              value={picked.riderId ?? ''}
              onChange={(id) => form.setValue('riderId', id, { shouldValidate: true })}
              riders={riders.data ?? []}
              loading={riders.isLoading}
              error={form.formState.errors.riderId?.message}
            />
            <Box sx={{ mt: 5 }}>
              <SelectionSummary rider={rider} vehicle={bike.data} loading={bike.isLoading} />
            </Box>
          </Panel>

          <Panel
            label="Return"
            subtitle="The condition decides where the returned bike goes next. It never goes straight back to the ready pool."
            sx={{ maxWidth: layout.readingMax }}
          >
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 5 }}>
              <SelectField
                control={form.control}
                name="returnCondition"
                label="Condition on return"
                options={CONDITIONS}
              />
            </Box>
            <Box sx={{ mt: 4 }}>
              <InfoStrip>
                Recovery is deliberately not an option in this flow — a bike that needs recovering
                is a different process. The returned bike goes to QC or the workshop.
              </InfoStrip>
            </Box>
            <Box sx={{ mt: 5 }}>
              <DispositionFields
                control={form.control}
                reasonName="reason"
                reasonLabel="Reason for exchange"
                reasonOptions={REASONS}
                dateName="occurredOn"
                dateLabel="Exchanged on"
                nextStateName="nextVehicleState"
                currentState={bike.data?.state ?? 'DEPLOYED'}
                condition={picked.returnCondition}
              />
            </Box>
          </Panel>

          <Panel label="Replacement bike" subtitle="Bikes that passed QC and are ready to go out.">
            <Controller
              control={form.control}
              name="toVehicleId"
              render={({ field, fieldState }) => (
                <VehiclePicker
                  value={field.value}
                  onChange={field.onChange}
                  error={fieldState.error?.message}
                  excludeId={rider?.currentVehicleId ?? undefined}
                />
              )}
            />
          </Panel>

          <Panel label="Summary" sx={{ maxWidth: layout.readingMax }}>
            <DefinitionList
              columns={2}
              items={[
                { label: 'Rider', value: rider ? `${rider.name} · ${rider.id}` : 'Not selected' },
                {
                  label: 'Reason',
                  value: EXCHANGE_REASON_LABEL[picked.reason ?? 'BREAKDOWN'],
                },
                {
                  label: 'Bike going back',
                  value: <Mono sx={{ fontSize: 13 }}>{rider?.currentVehicleId ?? '—'}</Mono>,
                },
                {
                  label: 'Replacement bike',
                  value: <Mono sx={{ fontSize: 13 }}>{picked.toVehicleId || 'Not selected'}</Mono>,
                },
                { label: 'Condition', value: RETURN_CONDITION_LABEL[picked.returnCondition ?? 'NONE'] },
                {
                  label: 'Returned bike goes to',
                  value: picked.nextVehicleState
                    ? VEHICLE_STATE_LABEL[picked.nextVehicleState]
                    : '—',
                },
                { label: 'Recorded as', value: 'Old assignment closed, new one opened' },
              ]}
            />
            <TextField
              label="Note (optional)"
              multiline
              minRows={2}
              fullWidth
              sx={{ mt: 5 }}
              {...form.register('note')}
              error={Boolean(form.formState.errors.note)}
              helperText={form.formState.errors.note?.message}
            />
          </Panel>
        </Box>
      </Box>
    </FormProvider>
  );
}