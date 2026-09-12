import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { Mono } from '../../components/Mono';
import { DefinitionList } from '../../components/DefinitionList';
import { InfoStrip } from '../../components/InfoStrip';
import { StateChip } from '../../components/StateChip';
import { onboardRider } from '../../lib/api/riders';
import { ApiError } from '../../lib/api/client';
import { invalidateRiders } from '../../lib/invalidate';
import {
  ONBOARD_RIDER_DEFAULTS,
  onboardRiderSchema,
  type OnboardRiderValues,
} from '../../lib/schemas/rider';
import { rupeesWithSymbol } from '../../lib/format';
import { PAYMENT_METHOD_LABEL } from '../../lib/labels';
import type { StatusTone } from '../../theme/tokens';
import type { VerificationState } from '../../components/VerifyField';
import { useRiderVerification, type VerifiableField } from './_components/useRiderVerification';
import { RiderIdentityStep } from './_components/RiderIdentityStep';
import { RiderContactStep } from './_components/RiderContactStep';
import { RiderAddressStep } from './_components/RiderAddressStep';
import { RiderCommercialStep } from './_components/RiderCommercialStep';

/**
 * A rider joins the register ACTIVE with KYC pending and no bike. The form
 * offers no status, no KYC and no bike field for that reason — all three are
 * consequences of a workflow step, not things typed in here. A rider can
 * exist with nothing to ride; assignment is screen 10, offered as the next
 * action once the rider exists.
 *
 * Same reasoning as AddVehicle landing a bike as INDUCTED.
 */
export function OnboardRider() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [banner, setBanner] = useState<string | null>(null);
  const verification = useRiderVerification();

  const form = useForm<OnboardRiderValues>({
    resolver: zodResolver(onboardRiderSchema),
    defaultValues: ONBOARD_RIDER_DEFAULTS,
    mode: 'onBlur',
  });

  const save = useMutation({
    mutationFn: (values: OnboardRiderValues) =>
      onboardRider({
        // Identity — step 1.
        aadhaarNumber: values.aadhaarNumber,
        name: values.name,
        permanentAddress: values.permanentAddress,
        // Contact — step 2.
        phone: values.phone,
        whatsappNumber: values.whatsappNumber,
        alternateNumber1: values.alternateNumber1,
        // Address — step 3.
        localAddress: values.localAddress,
        city: values.city,
        state: values.state,
        pinCode: values.pinCode,
        locationCoordinates: values.locationCoordinates || null,
        // Documents — step 3, optional.
        panNumber: values.panNumber || null,
        drivingLicence: values.drivingLicence || null,
        // Commercial — step 4.
        workingPlatform: values.workingPlatform,
        platformRiderId: values.platformRiderId || null,
        // Rupees at the desk, paise on the wire. Converted once, here.
        planAmount: values.planRupees * 100,
        billingDay: values.billingDay,
        paymentDay: values.paymentDay,
        paymentMode: values.paymentMode,
        depositPlan: values.depositRupees * 100,
        depositPaid: values.depositPaidRupees * 100,
        onboardedOn: values.onboardedOn,
        verification: verification.asRequest(),
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

  // The summary reads the live form rather than a second copy of the state,
  // so it cannot disagree with the fields above it.
  const preview = useWatch({ control: form.control });

  const verifiedCount = 4 - verification.outstanding.length;

  const verificationFields: { field: VerifiableField; label: string }[] = [
    { field: 'aadhaar', label: 'Aadhaar number' },
    { field: 'primary', label: 'Primary mobile' },
    { field: 'whatsapp', label: 'WhatsApp number' },
    { field: 'alt1', label: 'Alternate number' },
  ];

  const verificationChip: Record<VerificationState, { label: string; tone: StatusTone }> = {
    UNVERIFIED: { label: 'Pending', tone: 'neutral' },
    CODE_SENT: { label: 'Code sent', tone: 'caution' },
    VERIFYING: { label: 'Checking…', tone: 'caution' },
    VERIFIED: { label: 'Verified', tone: 'good' },
    FAILED: { label: 'Failed', tone: 'bad' },
  };

  return (
    <FormProvider {...form}>
      <Box component="form" onSubmit={submit} noValidate>
        <PageHeader
          section="Riders"
          title="Onboard rider"
          actions={
            <>
              <Button color="inherit" component={Link} to="/riders">
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={save.isPending || !verification.allVerified}
              >
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

        <Box sx={{ display: 'grid', gap: 5, mt: 5 }}>
          <InfoStrip>
            The rider id is generated on deployment. A rider joins the register with no bike — a
            bike is assigned from their record afterwards.
          </InfoStrip>

          {/* Form column + sticky review sidebar — same split as the detail pages. */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 372px' },
              gap: 5,
              alignItems: 'start',
            }}
          >
            {/* The steps, top to bottom. All stay visible and editable — the
                number is orientation, not a gate (see StepSection). */}
            <Box sx={{ display: 'grid', gap: 5 }}>
              {/* Step 1: Identity — Aadhaar + name + permanent address */}
              <RiderIdentityStep step={1} verification={verification} />

              {/* Step 2: Contact — four verified numbers */}
              <RiderContactStep step={2} verification={verification} />

              {/* Step 3: Address — local address, city/state/PIN, documents */}
              <RiderAddressStep step={3} />

              {/* Step 4: Commercial — platform, plan, payment day, deposit */}
              <RiderCommercialStep step={4} />
            </Box>

            {/* Review sidebar — sticky, so the operator sees the result of
                every keystroke without scrolling back up. */}
            <Box sx={{ position: { lg: 'sticky' }, top: { lg: 5 }, display: 'grid', gap: 5 }}>
              <Panel label="Summary">
                <DefinitionList
                  columns={2}
                  items={[
                    { label: 'Name', value: preview.name || '—' },
                    {
                      label: 'Aadhaar',
                      value: (
                        <Mono sx={{ fontSize: 13 }}>
                          {verification.stateOf('aadhaar') === 'VERIFIED'
                            ? 'Verified'
                            : 'Not verified'}
                        </Mono>
                      ),
                    },
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
                    {
                      label: 'Mode of payment',
                      value: preview.paymentMode ? PAYMENT_METHOD_LABEL[preview.paymentMode] : '—',
                    },
                    {
                      label: 'Platform',
                      value: preview.workingPlatform || '—',
                    },
                    {
                      label: 'KYC',
                      value: verification.allVerified ? 'All fields verified' : 'Pending — complete the verification steps above',
                    },
                    { label: 'Bike', value: 'Assigned separately' },
                  ]}
                />
                <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 4 }}>
                  The rider joins the register with no bike and KYC pending. Assign a bike from their
                  record — a pending KYC is shown there, but it does not block the assignment.
                </Typography>
              </Panel>

              <Panel label="Verification">
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 2,
                    mb: 3,
                  }}
                >
                  <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
                    {verifiedCount} of 4 fields verified
                  </Typography>
                  <StateChip
                    label={verification.allVerified ? 'Ready to onboard' : 'Pending'}
                    tone={verification.allVerified ? 'good' : 'warn'}
                  />
                </Box>
                <Box sx={{ display: 'grid', gap: 2 }}>
                  {verificationFields.map(({ field, label }) => (
                    <Box
                      key={field}
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 2,
                      }}
                    >
                      <Typography sx={{ fontSize: 13 }}>{label}</Typography>
                      <StateChip {...verificationChip[verification.stateOf(field)]} />
                    </Box>
                  ))}
                </Box>
              </Panel>
            </Box>
          </Box>
        </Box>
      </Box>
    </FormProvider>
  );
}