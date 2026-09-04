import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useForm, useWatch } from 'react-hook-form';
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
import { deboardRider } from '../../lib/api/assignments';
import { listAssignedRiders } from '../../lib/api/riders';
import { ApiError } from '../../lib/api/client';
import { invalidateAssignments } from '../../lib/invalidate';
import {
  deboardRiderSchema,
  today,
  type DeboardRiderValues,
} from '../../lib/schemas/assignment';
import {
  RETURN_CONDITION_LABEL,
  RETURN_CONDITION_NEXT_STATE,
  RETURN_CONDITION_TONE,
  VEHICLE_STATE_LABEL,
} from '../../lib/labels';
import { rupeesWithSymbol } from '../../lib/format';
import { layout } from '../../theme/tokens';

const CONDITIONS = (['NONE', 'MINOR', 'MAJOR', 'ACCIDENT'] as const).map((c) => ({
  value: c,
  label: RETURN_CONDITION_LABEL[c],
}));

/**
 * Screen 12. The gate — nothing else closes an assignment.
 *
 * The rider comes off the active register, because a rider with no bike and no
 * plan running is not active. Re-onboarding is what puts them back.
 *
 * The deposit arithmetic is deliberately not automated: what is deducted for
 * damage is a judgement someone at the desk makes, and the rule was never
 * written down. The screen shows the deposit, the outstanding rent and the
 * refund side by side and lets them settle it, rather than inventing a formula.
 */
export function DeboardRider() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const [banner, setBanner] = useState<string | null>(null);

  const riders = useQuery({
    queryKey: ['riders', 'assigned'],
    queryFn: listAssignedRiders,
  });

  const form = useForm<DeboardRiderValues>({
    resolver: zodResolver(deboardRiderSchema),
    defaultValues: {
      riderId: params.get('riderId') ?? '',
      vehicleId: '',
      returnedOn: today(),
      returnCondition: 'NONE',
      outstandingRentRupees: 0,
      depositRefundRupees: 0,
      note: '',
    },
    mode: 'onBlur',
  });

  const picked = useWatch({ control: form.control });
  const rider = riders.data?.find((r) => r.id === picked.riderId);

  // The bike is whichever one the rider holds, carried in the form so the
  // request states what the UI believed and a stale one can be rejected.
  useEffect(() => {
    const held = rider?.currentVehicleId ?? '';
    if (picked.vehicleId !== held) {
      form.setValue('vehicleId', held, { shouldValidate: Boolean(held) });
    }
  }, [rider, picked.vehicleId, form]);

  const save = useMutation({
    mutationFn: (values: DeboardRiderValues) =>
      deboardRider({
        riderId: values.riderId,
        vehicleId: values.vehicleId,
        returnedOn: values.returnedOn,
        returnCondition: values.returnCondition,
        // Rupees at the desk, paise on the wire. Converted once, here.
        outstandingRent: values.outstandingRentRupees * 100,
        depositRefund: values.depositRefundRupees * 100,
        note: values.note,
      }),
    onSuccess: () => invalidateAssignments(queryClient),
    onError: (error) => {
      if (error instanceof ApiError && error.field) {
        form.setError(error.field as keyof DeboardRiderValues, { message: error.message });
      } else {
        setBanner(error instanceof Error ? error.message : 'Could not deboard the rider');
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
        <PageHeader section="Riders" title="Deboard rider" />
        <EmptyState
          title="No rider is holding a bike"
          description="A deboard closes an open assignment, so there has to be one to close."
          action={
            <Button component={Link} to="/riders">
              Back to the register
            </Button>
          }
        />
      </>
    );
  }

  const condition = picked.returnCondition ?? 'NONE';
  const outstanding = (picked.outstandingRentRupees ?? 0) * 100;
  const refund = (picked.depositRefundRupees ?? 0) * 100;

  return (
    <Box component="form" onSubmit={submit} noValidate>
      <PageHeader
        section="Riders"
        title="Deboard rider"
        actions={
          <>
            <Button color="inherit" component={Link} to="/riders">
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Deboarding…' : 'Finalise deboard'}
            </Button>
          </>
        }
      />

      {banner && (
        <Alert severity="error" variant="outlined" sx={{ mt: 5 }}>
          {banner}
        </Alert>
      )}

      <Box sx={{ display: 'grid', gap: 5, mt: 5, maxWidth: layout.readingMax }}>
        <Panel label="Assignment being closed">
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
              label="Returned on"
              type="date"
              slotProps={{ inputLabel: { shrink: true } }}
              {...form.register('returnedOn')}
              error={Boolean(form.formState.errors.returnedOn)}
              helperText={form.formState.errors.returnedOn?.message}
            />
          </Box>
          <DefinitionList
            divider="top"
            columns={2}
            items={[
              {
                label: 'Bike returned',
                value: (
                  <Mono sx={{ fontSize: 13 }}>{rider?.currentVehicleId ?? 'No rider selected'}</Mono>
                ),
              },
              {
                label: 'Weekly rent',
                value: (
                  <Mono sx={{ fontSize: 13 }}>
                    {rider ? rupeesWithSymbol(rider.planAmount) : '—'}
                  </Mono>
                ),
              },
            ]}
          />
          {form.formState.errors.vehicleId && (
            <Typography sx={{ fontSize: 13, color: 'error.main', mt: 3 }}>
              {form.formState.errors.vehicleId.message}
            </Typography>
          )}
        </Panel>

        <Panel
          label="Condition on return"
          subtitle="This decides where the bike goes next. An undamaged bike still passes QC before it can be let out again."
        >
          <SelectField
            control={form.control}
            name="returnCondition"
            label="Condition"
            options={CONDITIONS}
          />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, mt: 4, flexWrap: 'wrap' }}>
            <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
              {rider?.currentVehicleId ?? 'The bike'} will move to
            </Typography>
            <StateChip
              label={VEHICLE_STATE_LABEL[RETURN_CONDITION_NEXT_STATE[condition]]}
              tone={RETURN_CONDITION_TONE[condition]}
            />
          </Box>
          <TextField
            label="Note (optional)"
            multiline
            minRows={3}
            fullWidth
            placeholder="Describe any damage, missing parts or dispute"
            sx={{ mt: 5 }}
            {...form.register('note')}
            error={Boolean(form.formState.errors.note)}
            helperText={form.formState.errors.note?.message}
          />
        </Panel>

        <Panel
          label="Settlement"
          subtitle="What is deducted for damage is a call made at the desk, so the refund is entered rather than calculated."
        >
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 5 }}>
            {/* A number input hands back a string unless it is asked not to. */}
            <TextField
              label="Outstanding rent (₹)"
              type="number"
              {...form.register('outstandingRentRupees', { valueAsNumber: true })}
              error={Boolean(form.formState.errors.outstandingRentRupees)}
              helperText={form.formState.errors.outstandingRentRupees?.message}
            />
            <TextField
              label="Deposit refunded (₹)"
              type="number"
              {...form.register('depositRefundRupees', { valueAsNumber: true })}
              error={Boolean(form.formState.errors.depositRefundRupees)}
              helperText={form.formState.errors.depositRefundRupees?.message}
            />
          </Box>
          <DefinitionList
            divider="top"
            columns={2}
            items={[
              { label: 'Rider', value: rider ? `${rider.name} · ${rider.id}` : 'Not selected' },
              { label: 'Condition', value: RETURN_CONDITION_LABEL[condition] },
              {
                label: 'Outstanding rent',
                value: <Mono sx={{ fontSize: 13 }}>{rupeesWithSymbol(outstanding)}</Mono>,
              },
              {
                label: 'Deposit refunded',
                value: <Mono sx={{ fontSize: 13 }}>{rupeesWithSymbol(refund)}</Mono>,
              },
              { label: 'Rider becomes', value: 'Inactive' },
            ]}
          />
          <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 4 }}>
            The rider comes off the active register and the bike is released. Re-onboarding puts
            them back.
          </Typography>
        </Panel>
      </Box>
    </Box>
  );
}
