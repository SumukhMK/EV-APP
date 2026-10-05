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
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Mono } from '../../components/Mono';
import { DefinitionList } from '../../components/DefinitionList';
import { StateChip } from '../../components/StateChip';
import { EmptyState } from '../../components/EmptyState';
import { SelectField } from '../../components/form/SelectField';
import { DateField } from '../../components/form/DateField';
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
import { useSession } from '../../app/sessionContext';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
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
  /** The server's refusal when dues exceed the deposit; an admin can override it below. */
  const [duesBlock, setDuesBlock] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { user } = useSession();
  const canOverrideDues = user.roleKey === 'SUPER_ADMIN' || user.roleKey === 'FLEET_ADMIN';
  const [pendingValues, setPendingValues] = useState<AssignVehicleValues | null>(null);

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
      overrideDues: false,
    },
    mode: 'onBlur',
  });

  const save = useMutation({
    mutationFn: assignVehicle,
    onSuccess: () => invalidateAssignments(queryClient),
    onError: (error) => {
      if (error instanceof ApiError && error.field === 'dues') {
        // Not a field the form owns: the rider owes more than the deposit
        // covers. Shown as its own block, with the admin's way through.
        setDuesBlock(error.message);
      } else if (error instanceof ApiError && error.field) {
        form.setError(error.field as keyof AssignVehicleValues, { message: error.message });
      } else {
        setBanner(error instanceof Error ? error.message : 'Could not assign the bike');
      }
    },
  });

  const submit = form.handleSubmit((values) => {
    setBanner(null);
    if (duesBlock && values.overrideDues && !values.note?.trim()) {
      form.setError('note', { message: 'Say why the bike is going out despite the dues' });
      return;
    }
    setPendingValues(values);
    setConfirmOpen(true);
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
          description="Every rider on the register, including deboarded ones, already has a bike or is suspended. Onboard a new rider, or use Exchange to move someone onto a different bike."
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

      <Box sx={{ display: 'grid', gap: 5, mt: 5, '& > *': { minWidth: 0 } }}>
        <Panel
          label="Rider"
          subtitle="Riders who do not have a bike right now, including deboarded riders — assigning puts them back on the register. KYC and dues are shown; dues above the deposit need an admin."
          sx={{ maxWidth: layout.readingMax }}
        >
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 5 }}>
            <SelectField
              control={form.control}
              name="riderId"
              label="Rider"
              searchable
              placeholder="Type a name or rider id"
              options={(riders.data ?? []).map((r) => ({
                value: r.id,
                label: [
                  `${r.name} · ${r.id} · ${KYC_STATUS_LABEL[r.kycStatus]}`,
                  r.status === 'DEBOARDED' ? 'Deboarded' : null,
                  r.duesPaise > 0 ? `owes ${rupeesWithSymbol(r.duesPaise)}` : null,
                ].filter(Boolean).join(' · '),
              }))}
            />
            <Controller
              control={form.control}
              name="startedOn"
              render={({ field: f, fieldState }) => (
                <DateField
                  label="Assigned on"
                  value={f.value ?? ''}
                  onChange={f.onChange}
                  error={Boolean(fieldState.error)}
                  helperText={fieldState.error?.message}
                />
              )}
            />
          </Box>
        </Panel>

        <Panel label="Available bikes" subtitle="Bikes that passed QC and are ready to go out.">
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
              {
                label: 'Owes',
                value: rider ? (
                  <Mono sx={{ fontSize: 13, color: rider.duesPaise > rider.depositHeld ? 'error.main' : undefined }}>
                    {rider.duesPaise > 0 ? rupeesWithSymbol(rider.duesPaise) : 'Nothing'}
                    {rider.duesPaise > 0 ? ` · deposit ${rupeesWithSymbol(rider.depositHeld)}` : ''}
                  </Mono>
                ) : '—',
              },
              { label: 'Bike becomes', value: 'Active' },
              {
                label: 'Rider becomes',
                value: rider?.status === 'DEBOARDED' ? 'Active — back on the register' : 'Active',
              },
            ]}
          />
          {duesBlock && (
            <Alert severity="warning" variant="outlined" sx={{ mt: 5 }}>
              {duesBlock}
              {canOverrideDues ? (
                <FormControlLabel
                  sx={{ display: 'flex', mt: 2 }}
                  control={
                    <Controller
                      control={form.control}
                      name="overrideDues"
                      render={({ field: f }) => (
                        <Checkbox checked={Boolean(f.value)} onChange={(e) => f.onChange(e.target.checked)} />
                      )}
                    />
                  }
                  label="Admin override — assign anyway, and say why in the note"
                />
              ) : (
                <Typography sx={{ fontSize: 13, mt: 2 }}>
                  Collect the dues first, or ask a fleet admin to override.
                </Typography>
              )}
            </Alert>
          )}
          <TextField
            label={duesBlock ? 'Note (required for an override)' : 'Note (optional)'}
            multiline
            minRows={2}
            fullWidth
            sx={{ mt: 5 }}
            {...form.register('note')}
            error={Boolean(form.formState.errors.note)}
            helperText={form.formState.errors.note?.message}
          />
          <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 4 }}>
            Rent starts on the assignment date. The bike stays with this rider until it is
            returned.
          </Typography>
        </Panel>
      </Box>
      <ConfirmDialog
        open={confirmOpen}
        title="Assign the bike?"
        message="The bike becomes active and rent starts for the rider."
        info={pendingValues ? [
          `${rider?.name ?? pendingValues.riderId} gets ${pendingValues.vehicleId} at ${rupeesWithSymbol(rider?.planAmount ?? 0)} a week.`,
          rider?.status === 'DEBOARDED' ? 'They were deboarded and go back on the register.' : null,
          rider && rider.duesPaise > 0 ? `They owe ${rupeesWithSymbol(rider.duesPaise)}, which stays on their ledger.` : null,
          pendingValues.overrideDues ? 'You are overriding the deposit limit as an admin.' : null,
          'Rent starts on the assignment date and the bike stays with the rider until it is returned.',
        ].filter(Boolean).join(' ') : undefined}
        confirmLabel="Assign bike"
        tone="neutral"
        dismissible
        pending={save.isPending}
        onConfirm={() => {
          setConfirmOpen(false);
          if (!pendingValues) return;
          save.mutateAsync(pendingValues)
            .then((r) => navigate(`/riders/${r.id}`, { state: { notice: `${pendingValues.vehicleId} assigned to ${r.name}` } }))
            .catch(() => { /* errors are surfaced by the mutation's onError */ });
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </Box>
  );
}
