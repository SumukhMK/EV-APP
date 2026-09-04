import { useState } from 'react';
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
import { DefinitionList } from '../../components/DefinitionList';
import { StateChip } from '../../components/StateChip';
import { EmptyState } from '../../components/EmptyState';
import { SelectField } from '../../components/form/SelectField';
import { VehiclePicker } from './VehiclePicker';
import { assignVehicle } from '../../lib/api/assignments';
import { listAssignableRiders } from '../../lib/api/riders';
import { ApiError } from '../../lib/api/client';
import { invalidateAssignments } from '../../lib/invalidate';
import {
  assignVehicleSchema,
  today,
  type AssignVehicleValues,
} from '../../lib/schemas/assignment';
import { KYC_STATUS_LABEL, KYC_STATUS_TONE } from '../../lib/labels';
import { rupeesWithSymbol } from '../../lib/format';
import { layout } from '../../theme/tokens';

/**
 * Screen 10. Opens a new assignment.
 *
 * The rider comes from `?riderId=` when the screen is reached from a rider
 * record, and from the dropdown when it is reached from the nav — the id is
 * never assumed to be there, because this route is linkable and bookmarkable.
 * Either way it is a form field, so the submit cannot fire without one.
 *
 * Only riders with no bike are offered: one rider, one bike is the register's
 * oldest rule, and a rider who already has one belongs on Exchange. KYC is
 * shown rather than enforced — see `listAssignableRiders`.
 */
export function AssignVehicle() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const [banner, setBanner] = useState<string | null>(null);

  const riders = useQuery({
    queryKey: ['riders', 'assignable'],
    queryFn: listAssignableRiders,
  });

  const form = useForm<AssignVehicleValues>({
    resolver: zodResolver(assignVehicleSchema),
    defaultValues: {
      riderId: params.get('riderId') ?? '',
      vehicleId: '',
      startedOn: today(),
      note: '',
    },
    mode: 'onBlur',
  });

  const save = useMutation({
    mutationFn: assignVehicle,
    onSuccess: () => invalidateAssignments(queryClient),
    onError: (error) => {
      if (error instanceof ApiError && error.field) {
        form.setError(error.field as keyof AssignVehicleValues, { message: error.message });
      } else {
        setBanner(error instanceof Error ? error.message : 'Could not assign the bike');
      }
    },
  });

  const submit = form.handleSubmit(async (values) => {
    setBanner(null);
    const rider = await save.mutateAsync(values);
    navigate(`/riders/${rider.id}`);
  });

  const picked = useWatch({ control: form.control });
  const rider = riders.data?.find((r) => r.id === picked.riderId);

  if (riders.isLoading) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 320 }}>
        <CircularProgress size={22} />
      </Box>
    );
  }

  // Nobody is waiting for a bike. Better to say so than to render a form whose
  // only dropdown is empty.
  if ((riders.data ?? []).length === 0) {
    return (
      <>
        <PageHeader section="Riders" title="Assign vehicle" />
        <EmptyState
          title="No rider is waiting for a bike"
          description="Every active rider on the register already holds one. Onboard a rider, or use Exchange to move someone onto a different bike."
          action={
            <Button component={Link} to="/riders/onboard">
              Onboard rider
            </Button>
          }
        />
      </>
    );
  }

  return (
    <Box component="form" onSubmit={submit} noValidate>
      <PageHeader
        section="Riders"
        title="Assign vehicle"
        actions={
          <>
            <Button color="inherit" component={Link} to="/riders">
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Assigning…' : 'Assign bike'}
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
          label="Rider"
          subtitle="Riders on the register who are not already holding a bike. KYC status is shown, not enforced."
          sx={{ maxWidth: layout.readingMax }}
        >
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 5 }}>
            <SelectField
              control={form.control}
              name="riderId"
              label="Rider"
              options={(riders.data ?? []).map((r) => ({
                value: r.id,
                label: `${r.name} · ${r.id} · ${KYC_STATUS_LABEL[r.kycStatus]}`,
              }))}
            />
            <TextField
              label="Assigned on"
              type="date"
              slotProps={{ inputLabel: { shrink: true } }}
              {...form.register('startedOn')}
              error={Boolean(form.formState.errors.startedOn)}
              helperText={form.formState.errors.startedOn?.message}
            />
          </Box>
        </Panel>

        <Panel label="Available bikes" subtitle="Ready to deploy.">
          <Controller
            control={form.control}
            name="vehicleId"
            render={({ field, fieldState }) => (
              <VehiclePicker
                value={field.value}
                onChange={field.onChange}
                error={fieldState.error?.message}
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
                label: 'Weekly rent',
                value: (
                  <Mono sx={{ fontSize: 13 }}>
                    {rider ? rupeesWithSymbol(rider.planAmount) : '—'}
                  </Mono>
                ),
              },
              {
                label: 'Bike',
                value: <Mono sx={{ fontSize: 13 }}>{picked.vehicleId || 'Not selected'}</Mono>,
              },
              {
                label: 'KYC',
                value: rider ? (
                  <StateChip
                    label={KYC_STATUS_LABEL[rider.kycStatus]}
                    tone={KYC_STATUS_TONE[rider.kycStatus]}
                  />
                ) : (
                  '—'
                ),
              },
              { label: 'Bike lands in', value: 'Deployed' },
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
          <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 4 }}>
            Billing starts from the assignment date. The bike moves to Deployed and cannot be
            assigned again until it is returned.
          </Typography>
        </Panel>
      </Box>
    </Box>
  );
}
