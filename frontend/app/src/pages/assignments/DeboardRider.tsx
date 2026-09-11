import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { Mono } from '../../components/Mono';
import { DefinitionList } from '../../components/DefinitionList';
import { EmptyState } from '../../components/EmptyState';
import { InfoStrip } from '../../components/InfoStrip';
import { DerivedField } from '../../components/DerivedField';
import { SelectField } from '../../components/form/SelectField';
import { RiderSearchSelect } from './_components/RiderSearchSelect';
import { SelectionSummary } from './_components/SelectionSummary';
import { DispositionFields } from './_components/DispositionFields';
import { deboardRider } from '../../lib/api/assignments';
import { listAssignedRiders, listRiderPayments } from '../../lib/api/riders';
import { ApiError } from '../../lib/api/client';
import { invalidateAssignments } from '../../lib/invalidate';
import {
  deboardRiderSchema,
  today,
  type DeboardRiderValues,
} from '../../lib/schemas/assignment';
import {
  DEBOARD_REASON_LABEL,
  RETURN_CONDITION_LABEL,
  VEHICLE_STATE_LABEL,
} from '../../lib/labels';
import { rupeesWithSymbol } from '../../lib/format';
import { layout } from '../../theme/tokens';
import type { DeboardReason } from '../../types';

const REASONS = (Object.keys(DEBOARD_REASON_LABEL) as DeboardReason[]).map((r) => ({
  value: r,
  label: DEBOARD_REASON_LABEL[r],
}));

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
      reason: 'OTHER',
      returnCondition: 'NONE',
      // The condition default for a DEPLOYED bike with no damage is RETURNED;
      // DispositionFields re-derives it from the condition on mount.
      nextVehicleState: 'RETURNED',
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

  // What the record says is owed this period — shown in the summary, typed
  // again in the settlement, because the settlement is what the desk agrees.
  const payments = useQuery({
    queryKey: ['rider-payments', rider?.id],
    queryFn: () => listRiderPayments(rider!.id),
    enabled: Boolean(rider),
  });
  const outstanding = (payments.data?.[0]?.totalDue ?? 0) - (payments.data?.[0]?.amountPaid ?? 0);

  const save = useMutation({
    mutationFn: (values: DeboardRiderValues) =>
      deboardRider({
        riderId: values.riderId,
        vehicleId: values.vehicleId,
        returnedOn: values.returnedOn,
        reason: values.reason,
        returnCondition: values.returnCondition,
        nextVehicleState: values.nextVehicleState,
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
          description="Deboarding closes an open assignment, and no rider has one open right now."
          action={
            <Button component={Link} to="/riders">
              Back to the register
            </Button>
          }
        />
      </>
    );
  }

  // What the deposit covers after the outstanding rent. Shown unclamped: a
  // negative figure means the rider owes more than the deposit covers, and
  // hiding that would be hiding the argument the desk needs to have.
  const net = (rider?.depositHeld ?? 0) - outstanding;
  const netLabel = net >= 0 ? rupeesWithSymbol(net) : `−${rupeesWithSymbol(-net)}`;

  return (
    <FormProvider {...form}>
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

        {/* The work on the left, a live review of it on the right.
            Everything typed into the settlement moves a figure in the review,
            and the review stays in view while it is typed — the settlement is
            the argument this screen exists to settle, so it should not be
            somewhere the operator has to scroll to find. The reading column
            keeps its width; the rail takes the space that used to sit empty. */}
        <Box
          sx={{
            display: 'grid',
            gap: 5,
            mt: 5,
            alignItems: 'start',
            gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 360px' },
            maxWidth: layout.readingMax + 380,
          }}
        >
          <Box sx={{ display: 'grid', gap: 5, minWidth: 0 }}>
          <Panel label="Assignment being closed">
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
              <SelectionSummary
                rider={rider}
                variant="deboard"
                outstandingRent={payments.isLoading ? undefined : outstanding}
              />
            </Box>
            {form.formState.errors.vehicleId && (
              <Typography sx={{ fontSize: 13, color: 'error.main', mt: 3 }}>
                {form.formState.errors.vehicleId.message}
              </Typography>
            )}
          </Panel>

          <Panel
            label="Why the bike is coming back"
            subtitle="The condition decides where the bike goes next. Even an undamaged bike goes through QC before it can go out again."
          >
            {/* The note sits beside the control it qualifies rather than under
                it — a lone select in a two-column row left half the panel bare. */}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                gap: 5,
                alignItems: 'start',
              }}
            >
              <SelectField
                control={form.control}
                name="returnCondition"
                label="Condition on return"
                options={CONDITIONS}
              />
              <InfoStrip>
                Recovery is deliberately not an option in this flow — a bike that needs recovering
                is a different process. The returned bike goes to QC or the workshop.
              </InfoStrip>
            </Box>
            <Box sx={{ mt: 5 }}>
              <DispositionFields
                control={form.control}
                reasonName="reason"
                reasonLabel="Deboard reason"
                reasonOptions={REASONS}
                dateName="returnedOn"
                dateLabel="Returned on"
                nextStateName="nextVehicleState"
                // A rider holding a bike means it is DEPLOYED — the register's
                // one-to-one rule, enforced by the assignment API.
                currentState="DEPLOYED"
                condition={picked.returnCondition}
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
            subtitle="Type in the refund yourself. How much to hold back for damage is a call made at the desk, not a formula."
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
            <Box sx={{ mt: 5 }}>
              <DerivedField
                label="Net after outstanding rent"
                value={netLabel}
                derivation="Deposit held − outstanding rent. Negative means the deposit does not cover what is owed."
              />
            </Box>
          </Panel>
          </Box>

          {/* Sticky so it follows the form down. On a narrow screen it simply
              lands last, which is the order the operator reads anyway: fill
              the form, then check what it is about to do. */}
          <Box sx={{ position: { lg: 'sticky' }, top: 16, minWidth: 0 }}>
            <Panel
              label="Before you finalise"
              subtitle="What this closes, as it stands right now."
            >
              <DefinitionList
                divider="top"
                columns={1}
                items={[
                  { label: 'Rider', value: rider ? `${rider.name} · ${rider.id}` : 'Not selected' },
                  {
                    label: 'Condition',
                    value: RETURN_CONDITION_LABEL[picked.returnCondition ?? 'NONE'],
                  },
                  {
                    label: 'Returned bike goes to',
                    value: picked.nextVehicleState
                      ? VEHICLE_STATE_LABEL[picked.nextVehicleState]
                      : '—',
                  },
                  {
                    label: 'Outstanding rent',
                    value: (
                      <Mono sx={{ fontSize: 13 }}>
                        {rupeesWithSymbol((picked.outstandingRentRupees ?? 0) * 100)}
                      </Mono>
                    ),
                  },
                  {
                    label: 'Deposit refunded',
                    value: (
                      <Mono sx={{ fontSize: 13 }}>
                        {rupeesWithSymbol((picked.depositRefundRupees ?? 0) * 100)}
                      </Mono>
                    ),
                  },
                  { label: 'Rider becomes', value: 'Inactive' },
                ]}
              />
              <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 4 }}>
                The rider becomes inactive and the bike is freed up. Onboard them again to bring
                them back.
              </Typography>
            </Panel>
          </Box>
        </Box>
      </Box>
    </FormProvider>
  );
}