import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { invalidateVehicles } from '../../lib/invalidate';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { SelectField } from '../../components/form/SelectField';
import { createVehicle } from '../../lib/api/vehicles';
import { ApiError } from '../../lib/api/client';
import { ADD_VEHICLE_DEFAULTS, addVehicleSchema, type AddVehicleValues } from '../../lib/schemas/vehicle';
import { MODELS, HUBS } from '../../mocks/seed';
import { layout } from '../../theme/tokens';

/**
 * A new bike enters as INDUCTED, never as READY_TO_DEPLOY — it has to pass
 * through inspection first. The form does not offer a state field for that
 * reason; the state is a consequence of the workflow, not an input.
 */
export function AddVehicle() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [banner, setBanner] = useState<string | null>(null);

  const form = useForm<AddVehicleValues>({
    resolver: zodResolver(addVehicleSchema),
    defaultValues: ADD_VEHICLE_DEFAULTS,
    mode: 'onBlur',
  });

  const save = useMutation({
    mutationFn: (values: AddVehicleValues) =>
      createVehicle({
        id: values.id,
        chassisNumber: values.chassisNumber,
        model: values.model,
        batteryType: values.batteryType,
        hub: values.hub,
        inductedOn: values.purchaseDate,
      }),
    onSuccess: () => invalidateVehicles(queryClient),
    onError: (error) => {
      if (error instanceof ApiError && error.field) {
        form.setError(error.field as keyof AddVehicleValues, { message: error.message });
      } else {
        setBanner(error instanceof Error ? error.message : 'Could not save the vehicle');
      }
    },
  });

  const submit = (andAnother: boolean) =>
    form.handleSubmit(async (values) => {
      setBanner(null);
      const created = await save.mutateAsync(values);
      if (andAnother) {
        form.reset({ ...ADD_VEHICLE_DEFAULTS, hub: values.hub, make: values.make, model: values.model });
        setBanner(`${created.id} added. The form is ready for the next one.`);
      } else {
        navigate(`/vehicles/${created.id}`);
      }
    });

  const field = (name: keyof AddVehicleValues) => ({
    ...form.register(name),
    error: Boolean(form.formState.errors[name]),
    helperText: form.formState.errors[name]?.message,
  });

  return (
    <Box component="form" onSubmit={submit(false)} noValidate>
      <PageHeader
        section="Fleet / Vehicles"
        title="Add vehicle"
        actions={
          <>
            <Button color="inherit" onClick={() => navigate('/vehicles')}>
              Cancel
            </Button>
            <Button color="inherit" onClick={submit(true)} disabled={save.isPending}>
              Save and add another
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Save vehicle'}
            </Button>
          </>
        }
      />

      {banner && (
        <Alert severity={save.isError ? 'error' : 'success'} variant="outlined" sx={{ mt: 5 }}>
          {banner}
        </Alert>
      )}

      <Box sx={{ display: 'grid', gap: 5, mt: 5, maxWidth: layout.readingMax }}>
        <Panel label="Identity">
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 5 }}>
            <TextField label="Vehicle id" placeholder="BLRSS0451" {...field('id')} />
            <TextField label="Chassis number" placeholder="17 characters" {...field('chassisNumber')} />
            <SelectField
              control={form.control}
              name="hub"
              label="Hub"
              options={HUBS.map((h) => ({ value: h, label: h }))}
            />
            <TextField
              label="Purchase date"
              type="date"
              slotProps={{ inputLabel: { shrink: true } }}
              {...field('purchaseDate')}
            />
          </Box>
        </Panel>

        <Panel label="Specification">
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 5 }}>
            <TextField label="Make" placeholder="e-Connects" {...field('make')} />
            <SelectField
              control={form.control}
              name="model"
              label="Model"
              options={MODELS.map((m) => ({ value: m, label: m }))}
            />
            <SelectField
              control={form.control}
              name="batteryType"
              label="Battery"
              options={[
                { value: 'SWAPPABLE', label: 'Sun Mobility' },
                { value: 'FIXED', label: 'Fixed pack' },
              ]}
            />
            <TextField label="Motor number" {...field('motorNumber')} />
          </Box>
        </Panel>

        <Panel label="Devices">
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 5 }}>
            <TextField label="Controller number" {...field('controllerNumber')} />
            <TextField label="RFID tag" {...field('rfidTag')} />
          </Box>
          <TextField label="Notes" multiline minRows={3} sx={{ mt: 5 }} {...field('notes')} />
        </Panel>
      </Box>
    </Box>
  );
}
