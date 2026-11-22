import { useState } from 'react';
import AddIcon from '@mui/icons-material/AddCircleOutlineOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { invalidateVehicles } from '../../lib/invalidate';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { SelectField } from '../../components/form/SelectField';
import { DateField } from '../../components/form/DateField';
import { MandatoryLabel } from '../../components/form/MandatoryLabel';
import { createVehicle } from '../../lib/api/vehicles';
import { ApiError } from '../../lib/api/client';
import { ADD_VEHICLE_DEFAULTS, addVehicleSchema, type AddVehicleValues } from '../../lib/schemas/vehicle';
import { useFormOptions } from '../../lib/useFormOptions';
import { layout } from '../../theme/tokens';
import { shakeStyles } from '../../hooks/useShakeValidation';

/**
 * A new bike enters as INDUCTED, never as READY_TO_DEPLOY — it has to pass
 * through inspection first. The form does not offer a state field for that
 * reason; the state is a consequence of the workflow, not an input.
 */
export function AddVehicle() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // The tenant's hubs and models, not the seed's. A hub added through the
  // API never appeared here while the lists were constants.
  const reference = useFormOptions();
  const [banner, setBanner] = useState<{ message: string; severity: 'error' | 'success' } | null>(null);

  const form = useForm<AddVehicleValues>({
    resolver: zodResolver(addVehicleSchema),
    defaultValues: ADD_VEHICLE_DEFAULTS,
    mode: 'onBlur',
  });
  // Subscribed, not read on render: the pickers must keep offering what
  // the form holds even before the reference lists arrive.
  const hubValue = useWatch({ control: form.control, name: 'hub' });
  const modelValue = useWatch({ control: form.control, name: 'model' });

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
        setBanner({ message: error instanceof Error ? error.message : 'Could not save the vehicle', severity: 'error' });
      }
    },
  });

  /**
   * Take the operator to the first thing that is wrong. A refused submit that
   * only reddened a field below the fold looked like nothing happened. Scrolls
   * the first red field into view, shakes it, and puts the cursor in it — the
   * same guidance the onboard rider form gives.
   */
  const goToProblem = () => {
    // The error props land on the fields after the submit handler returns, so
    // the first red field is looked up on the next tick.
    setTimeout(() => {
      const invalid = document.querySelector<HTMLElement>('form [aria-invalid="true"]');
      const target = invalid?.closest('.MuiFormControl-root') ?? invalid;
      if (!target) return;
      target.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      target.classList.add('shake-field');
      setTimeout(() => target.classList.remove('shake-field'), 600);
      invalid?.focus?.();
    }, 0);
  };

  const submit = (andAnother: boolean) =>
    form.handleSubmit(
      async (values) => {
        setBanner(null);
        // Errors are shown by the mutation's onError (on the field, or as the
        // banner); the rejection here is the same error and needs no second home.
        const created = await save.mutateAsync(values).catch(() => null);
        if (!created) return;
        if (andAnother) {
          form.reset({ ...ADD_VEHICLE_DEFAULTS, hub: values.hub, make: values.make, model: values.model });
          setBanner({ message: `${created.id} added. The form is ready for the next one.`, severity: 'success' });
        } else {
          navigate(`/vehicles/${created.id}`, { state: { notice: `${created.id} added to the fleet — it is Onboarding until its first check` } });
        }
      },
      (errors) => {
        const count = Object.keys(errors).length;
        setBanner({
          message: count === 1
            ? 'One field needs attention — it is marked below.'
            : `${count} fields need attention — the first is marked below.`,
          severity: 'error',
        });
        goToProblem();
      },
    );

  const field = (name: keyof AddVehicleValues) => ({
    ...form.register(name),
    error: Boolean(form.formState.errors[name]),
    helperText: form.formState.errors[name]?.message,
  });

  return (
    <Box component="form" onSubmit={submit(false)} noValidate sx={shakeStyles}>
      <PageHeader
        section="Fleet / Vehicles"
        title="Add vehicle"
        icon={AddIcon}
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
        <Alert severity={banner.severity} variant="outlined" sx={{ mt: 5 }}>
          {banner.message}
        </Alert>
      )}

      <Box sx={{ display: 'grid', gap: 5, mt: 5, maxWidth: layout.readingMax }}>
        <Panel label="Identity">
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 5 }}>
            <TextField label={<>Vehicle id <MandatoryLabel /></>} placeholder="BLRSS0451" {...field('id')} />
            <TextField label={<>Chassis number <MandatoryLabel /></>} placeholder="17 characters" {...field('chassisNumber')} />
            <SelectField
              control={form.control}
              name="hub"
              label="Hub"
              options={reference.including(reference.hubs, hubValue)}
            />
            <Controller
              control={form.control}
              name="purchaseDate"
              render={({ field: f, fieldState }) => (
                <DateField
                  label={<>Purchase date <MandatoryLabel /></>}
                  labelText="Purchase date"
                  value={f.value ?? ''}
                  onChange={f.onChange}
                  error={Boolean(fieldState.error)}
                  helperText={fieldState.error?.message}
                />
              )}
            />
          </Box>
        </Panel>

        <Panel label="Specification">
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 5 }}>
            <TextField label={<>Make <MandatoryLabel /></>} placeholder="e-Connects" {...field('make')} />
            <SelectField
              control={form.control}
              name="model"
              label={<>Model <MandatoryLabel /></>}
              options={reference.including(reference.models, modelValue)}
            />
            <SelectField
              control={form.control}
              name="batteryType"
              label="Battery"
              options={[
                { value: 'Sun Mobility', label: 'Sun Mobility' },
                { value: 'Battery Smart', label: 'Battery Smart' },
                { value: 'Yuma', label: 'Yuma' },
                { value: 'Honda Swap', label: 'Honda Swap' },
              ]}
            />
            <TextField label="Battery vendor" placeholder="e.g. Sun Mobility" {...field('batteryVendor')} />
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
