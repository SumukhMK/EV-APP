import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { Mono } from '../../components/Mono';
import { DefinitionList } from '../../components/DefinitionList';
import { SelectField } from '../../components/form/SelectField';
import { onboardRider } from '../../lib/api/riders';
import { ApiError } from '../../lib/api/client';
import { invalidateRiders } from '../../lib/invalidate';
import {
  ONBOARD_RIDER_DEFAULTS,
  onboardRiderSchema,
  type OnboardRiderValues,
} from '../../lib/schemas/rider';
import { rupeesWithSymbol } from '../../lib/format';
import { layout } from '../../theme/tokens';

/**
 * A rider joins the register ACTIVE with KYC pending and no bike. The form
 * offers no status, no KYC and no bike field for that reason — all three are
 * consequences of a workflow step, not things typed in here. Assignment is
 * screen 10, and it is offered as the next action once the rider exists.
 *
 * Same reasoning as AddVehicle landing a bike as INDUCTED.
 */
export function OnboardRider() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [banner, setBanner] = useState<string | null>(null);

  const form = useForm<OnboardRiderValues>({
    resolver: zodResolver(onboardRiderSchema),
    defaultValues: ONBOARD_RIDER_DEFAULTS,
    mode: 'onBlur',
  });

  const save = useMutation({
    mutationFn: (values: OnboardRiderValues) =>
      onboardRider({
        // Identity — simplified form provides name and phone only; full
        // identity step is Task 16 (Abhiram).
        aadhaarNumber: '',
        name: values.name,
        permanentAddress: '',
        // Contact
        phone: values.phone,
        whatsappNumber: values.phone,
        alternateNumber1: '',
        alternateNumber2: '',
        // Local address
        localAddress: '',
        city: '',
        state: '',
        pinCode: '',
        locationCoordinates: null,
        // Documents
        panNumber: null,
        drivingLicence: null,
        // Commercial
        workingPlatform: 'Other',
        platformRiderId: null,
        // Rupees at the desk, paise on the wire. Converted once, here.
        planAmount: values.planRupees * 100,
        billingDay: values.billingDay,
        paymentDay: 'MONDAY',
        depositPlan: values.depositRupees * 100,
        depositPaid: values.depositRupees * 100,
        onboardedOn: values.onboardedOn,
        verification: {
          aadhaarVerified: false,
          primaryVerified: false,
          whatsappVerified: false,
          alternate1Verified: false,
          alternate2Verified: false,
        },
        vehicleId: null,
      }),
    onSuccess: () => invalidateRiders(queryClient),
    onError: (error) => {
      if (error instanceof ApiError && error.field) {
        form.setError(error.field as keyof OnboardRiderValues, { message: error.message });
      } else {
        setBanner(error instanceof Error ? error.message : 'Could not onboard the rider');
      }
    },
  });

  const submit = form.handleSubmit(async (values) => {
    setBanner(null);
    const created = await save.mutateAsync(values);
    navigate(`/riders/${created.id}`);
  });

  const field = (name: keyof OnboardRiderValues) => ({
    ...form.register(name),
    error: Boolean(form.formState.errors[name]),
    helperText: form.formState.errors[name]?.message,
  });

  /** A number input hands back a string unless it is asked not to. */
  const amount = (name: 'planRupees' | 'depositRupees') => ({
    ...form.register(name, { valueAsNumber: true }),
    type: 'number' as const,
    error: Boolean(form.formState.errors[name]),
    helperText: form.formState.errors[name]?.message,
  });

  // The summary reads the live form rather than a second copy of the state,
  // so it cannot disagree with the fields above it.
  const preview = useWatch({ control: form.control });

  return (
    <Box component="form" onSubmit={submit} noValidate>
      <PageHeader
        section="Riders"
        title="Onboard rider"
        actions={
          <>
            <Button color="inherit" component={Link} to="/riders">
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Onboarding…' : 'Onboard rider'}
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
        <Panel label="Rider">
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 5 }}>
            <TextField label="Name" placeholder="Full name" {...field('name')} />
            <TextField label="Phone" placeholder="10 digits" {...field('phone')} />
            <TextField
              label="Onboarded on"
              type="date"
              slotProps={{ inputLabel: { shrink: true } }}
              {...field('onboardedOn')}
            />
          </Box>
        </Panel>

        <Panel
          label="Plan"
          subtitle="Rent is billed weekly on the rider's billing day. Amounts are in rupees."
        >
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 5 }}>
            <TextField label="Weekly rent (₹)" {...amount('planRupees')} />
            <SelectField
              control={form.control}
              name="billingDay"
              label="Billing day"
              options={[
                { value: 'MONDAY', label: 'Monday' },
                { value: 'WEDNESDAY', label: 'Wednesday' },
              ]}
            />
            <TextField label="Deposit (₹)" {...amount('depositRupees')} />
          </Box>
        </Panel>

        <Panel label="Summary">
          <DefinitionList
            columns={2}
            items={[
              { label: 'Name', value: preview.name || '—' },
              { label: 'Phone', value: <Mono sx={{ fontSize: 13 }}>{preview.phone || '—'}</Mono> },
              {
                label: 'Weekly rent',
                value: (
                  <Mono sx={{ fontSize: 13 }}>
                    {preview.planRupees ? rupeesWithSymbol(preview.planRupees * 100) : '—'}
                  </Mono>
                ),
              },
              {
                label: 'Billing day',
                value: preview.billingDay === 'WEDNESDAY' ? 'Wednesday' : 'Monday',
              },
              {
                label: 'Deposit',
                value: (
                  <Mono sx={{ fontSize: 13 }}>
                    {rupeesWithSymbol((preview.depositRupees ?? 0) * 100)}
                  </Mono>
                ),
              },
              { label: 'KYC', value: 'Pending — verified separately' },
              { label: 'Bike', value: 'Assigned separately' },
            ]}
          />
          <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 4 }}>
            The rider joins the register with no bike and KYC pending. Assign a bike from their
            record — a pending KYC is shown there, but it does not block the assignment.
          </Typography>
        </Panel>
      </Box>
    </Box>
  );
}
