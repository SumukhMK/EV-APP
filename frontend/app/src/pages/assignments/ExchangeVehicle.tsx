import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { Mono } from '../../components/Mono';
import { StateChip } from '../../components/StateChip';
import { DefinitionList } from '../../components/DefinitionList';
import { EmptyState } from '../../components/EmptyState';
import { SelectField } from '../../components/form/SelectField';
import { VehiclePicker } from './VehiclePicker';
import { exchangeVehicle } from '../../lib/api/assignments';
import { listAssignedRiders } from '../../lib/api/riders';
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
  RETURN_CONDITION_NEXT_STATE,
  RETURN_CONDITION_TONE,
  VEHICLE_STATE_LABEL,
} from '../../lib/labels';
import { layout } from '../../theme/tokens';

const REASONS = (['BREAKDOWN', 'ACCIDENT', 'RIDER_REQUEST', 'UPGRADE'] as const).map((r) => ({
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
 * coming back takes the same route a deboarded one does.
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

  const save = useMutation({
    mutationFn: exchangeVehicle,
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
          description="An exchange closes one assignment and opens another, so it needs a rider who already has a bike."
          action={
            <Button component={Link} to="/assignments/assign">
              Assign a bike
            </Button>
          }
        />
      </>
    );
  }

  const condition = picked.returnCondition ?? 'NONE';

  return (
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

      <Box sx={{ display: 'grid', gap: 5, mt: 5 }}>
        <Panel
          label="Current assignment"
          subtitle="Only riders currently holding a bike are listed."
          sx={{ maxWidth: layout.readingMax }}
        >
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 5 }}>
            <SelectField
              control={form.control}
              name="riderId"
              label="Rider"
              options={(riders.data ?? []).map((r) => ({
                value: r.id,
                label: `${r.name} · ${r.id}`,
              }))}
            />
            <TextField
              label="Exchanged on"
              type="date"
              slotProps={{ inputLabel: { shrink: true } }}
              {...form.register('occurredOn')}
              error={Boolean(form.formState.errors.occurredOn)}
              helperText={form.formState.errors.occurredOn?.message}
            />
          </Box>
          <DefinitionList
            divider="top"
            columns={2}
            items={[
              {
                label: 'Bike going back',
                value: (
                  <Mono sx={{ fontSize: 13 }}>{rider?.currentVehicleId ?? 'No rider selected'}</Mono>
                ),
              },
              { label: 'Phone', value: <Mono sx={{ fontSize: 13 }}>{rider?.phone ?? '—'}</Mono> },
            ]}
          />
        </Panel>

        <Panel
          label="Return"
          subtitle="The bike coming back takes its next state from its condition. It cannot go straight back into the yard."
          sx={{ maxWidth: layout.readingMax }}
        >
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 5 }}>
            <SelectField
              control={form.control}
              name="reason"
              label="Reason for exchange"
              options={REASONS}
            />
            <SelectField
              control={form.control}
              name="returnCondition"
              label="Condition on return"
              options={CONDITIONS}
            />
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, mt: 4, flexWrap: 'wrap' }}>
            <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
              {rider?.currentVehicleId ?? 'The returned bike'} will move to
            </Typography>
            <StateChip
              label={VEHICLE_STATE_LABEL[RETURN_CONDITION_NEXT_STATE[condition]]}
              tone={RETURN_CONDITION_TONE[condition]}
            />
          </Box>
        </Panel>

        <Panel label="Replacement bike" subtitle="Ready to deploy.">
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
              { label: 'Condition', value: RETURN_CONDITION_LABEL[condition] },
              { label: 'Recorded as', value: 'Two events — one closed, one opened' },
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
  );
}
