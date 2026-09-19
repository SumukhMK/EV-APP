import { useEffect, useState } from 'react';
import EditIcon from '@mui/icons-material/EditOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import TextField from '@mui/material/TextField';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { invalidateVehicles } from '../../lib/invalidate';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { EmptyState } from '../../components/EmptyState';
import { SelectField } from '../../components/form/SelectField';
import { getVehicle, updateVehicle } from '../../lib/api/vehicles';
import { ApiError } from '../../lib/api/client';
import { editVehicleSchema, type EditVehicleValues } from '../../lib/schemas/vehicle';
import { MODELS, HUBS } from '../../mocks/seed';
import { layout } from '../../theme/tokens';

/**
 * A correction to the record, not a re-registration — the id, the chassis
 * number and when it was inducted are facts about how the bike entered the
 * fleet, and are not offered here. State, the rider and the odometer change
 * through the assignment, exchange and telemetry flows, not this form.
 */
export function EditVehicle() {
  const { vehicleId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [banner, setBanner] = useState<string | null>(null);

  const vehicle = useQuery({
    queryKey: ['vehicle', vehicleId],
    queryFn: () => getVehicle(vehicleId),
    retry: false,
  });

  const form = useForm<EditVehicleValues>({
    resolver: zodResolver(editVehicleSchema),
    defaultValues: {
      hub: '',
      make: '',
      model: '',
      batteryType: 'Sun Mobility',
      batteryVendor: '',
      registrationNumber: '',
      motorNumber: '',
      controllerNumber: '',
      rfidTag: '',
    },
    mode: 'onBlur',
  });

  // The form only has values worth showing once the record has loaded, so it
  // resets onto the fetched vehicle rather than trying to seed defaults
  // before the request returns.
  useEffect(() => {
    if (!vehicle.data) return;
    const v = vehicle.data;
    form.reset({
      hub: v.hub,
      make: v.make,
      model: v.model,
      batteryType: v.batteryType,
      batteryVendor: v.batteryVendor ?? '',
      registrationNumber: v.registrationNumber ?? '',
      motorNumber: v.motorNumber ?? '',
      controllerNumber: v.controllerNumber ?? '',
      rfidTag: v.rfidTag ?? '',
    });
  }, [vehicle.data, form]);

  const save = useMutation({
    mutationFn: (values: EditVehicleValues) => updateVehicle({ vehicleId, ...values }),
    onSuccess: () => {
      invalidateVehicles(queryClient);
      navigate(`/vehicles/${vehicleId}`);
    },
    onError: (error) => {
      setBanner(error instanceof ApiError ? error.message : 'Could not save the vehicle');
    },
  });

  const submit = form.handleSubmit((values) => {
    setBanner(null);
    save.mutate(values);
  });

  if (vehicle.isLoading) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 320 }}>
        <CircularProgress size={22} />
      </Box>
    );
  }

  if (vehicle.isError || !vehicle.data) {
    return (
      <>
        <PageHeader section="Fleet / Vehicles" title="Not found" />
        <EmptyState
          title={`No vehicle with id ${vehicleId}`}
          description="It may have been retired, or the link is stale."
        />
      </>
    );
  }

  const field = (name: keyof EditVehicleValues) => ({
    ...form.register(name),
    error: Boolean(form.formState.errors[name]),
    helperText: form.formState.errors[name]?.message,
  });

  return (
    <Box component="form" onSubmit={submit} noValidate>
      <PageHeader
        section="Fleet / Vehicles"
        title={`Edit ${vehicleId}`}
        icon={EditIcon}
        backTo={`/vehicles/${vehicleId}`}
        backLabel="Back to vehicle"
        actions={
          <>
            <Button color="inherit" onClick={() => navigate(`/vehicles/${vehicleId}`)}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Save changes'}
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
                { value: 'Sun Mobility', label: 'Sun Mobility' },
                { value: 'Battery Smart', label: 'Battery Smart' },
                { value: 'Yuma', label: 'Yuma' },
                { value: 'Honda Swap', label: 'Honda Swap' },
              ]}
            />
            <TextField label="Battery vendor" placeholder="e.g. Sun Mobility" {...field('batteryVendor')} />
            <SelectField
              control={form.control}
              name="hub"
              label="Hub"
              options={HUBS.map((h) => ({ value: h, label: h }))}
            />
            <TextField label="Registration number" {...field('registrationNumber')} />
          </Box>
        </Panel>

        <Panel label="Devices">
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 5 }}>
            <TextField label="Motor number" {...field('motorNumber')} />
            <TextField label="Controller number" {...field('controllerNumber')} />
            <TextField label="RFID tag" {...field('rfidTag')} />
          </Box>
        </Panel>
      </Box>
    </Box>
  );
}
