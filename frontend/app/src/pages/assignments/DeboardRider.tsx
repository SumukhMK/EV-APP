import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Mono } from '../../components/Mono';
import { DefinitionList } from '../../components/DefinitionList';
import { EmptyState } from '../../components/EmptyState';
import { InfoStrip } from '../../components/InfoStrip';
import { DerivedField } from '../../components/DerivedField';
import { SelectField } from '../../components/form/SelectField';
import { RiderSearchSelect } from './_components/RiderSearchSelect';
import { SelectionSummary } from './_components/SelectionSummary';
import { DispositionFields } from './_components/DispositionFields';
import { DamageItemsField } from './_components/DamageItemsField';
import { deboardRider } from '../../lib/api/assignments';
import { listAssignedRiders, listRiderPayments } from '../../lib/api/riders';
import { ApiError } from '../../lib/api/client';
import { invalidateAssignments, invalidateServiceJobs } from '../../lib/invalidate';
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
  const [confirmedValues, setConfirmedValues] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingValues, setPendingValues] = useState<DeboardRiderValues | null>(null);

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
      nextVehicleState: 'QC_PENDING',
      outstandingRentRupees: 0,
      depositRefundRupees: 0,
      note: '',
      damageItems: [],
    },
    mode: 'onBlur',
  });

  const picked = useWatch({ control: form.control });
  const confirmationKey = JSON.stringify(picked);
  const confirmed = confirmedValues === confirmationKey;
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
        // Worked out here, not typed: deposit held minus the rent owed. Anything
        // the damage costs is taken off later, on the service job, once the bike
        // has actually been looked at.
        depositRefund: Math.max(0, (rider?.depositHeld ?? 0) - values.outstandingRentRupees * 100),
        note: values.note,
        damageItems: values.damageItems,
      }),
    onSuccess: (updated) => {
      invalidateAssignments(queryClient);
      invalidateServiceJobs(queryClient);
      navigate(`/riders/${updated.id}`);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.field) {
        form.setError(error.field as keyof DeboardRiderValues, { message: error.message });
      } else {
        setBanner(error instanceof Error ? error.message : 'Could not deboard the rider');
      }
    },
  });

  const submit = form.handleSubmit((values) => {
    setBanner(null);
    if (!confirmed) { setBanner('Confirm the return destination and settlement before finalising.'); return; }
    setPendingValues(values);
    setConfirmOpen(true);
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
          description="This screen takes a bike back from a rider, and nobody has one right now."
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
  const net = (rider?.depositHeld ?? 0) - (picked.outstandingRentRupees ?? 0) * 100;
  const refundPaise = Math.max(0, net);
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
              <Button type="submit" disabled={save.isPending || !confirmed}>
                {save.isPending ? 'Saving…' : 'Finish and take the bike back'}
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
          <Panel label="Rider and bike">
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
            label="Why is the bike coming back?"
            subtitle="The condition you pick suggests where the bike should go. You can choose something else, just say why."
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
                label="What condition is the bike in?"
                options={CONDITIONS}
              />
              <InfoStrip>
Recovery is not offered here — that is a separate job. Choose Quality Check, In Service, or Accident.
              </InfoStrip>
            </Box>
            <Box sx={{ mt: 5 }}>
              <DispositionFields
                control={form.control}
                reasonName="reason"
                reasonLabel="Why is the rider giving it back?"
                reasonOptions={REASONS}
                dateName="returnedOn"
                dateLabel="Date it came back"
                nextStateName="nextVehicleState"
                condition={picked.returnCondition}
              />
            </Box>
            {picked.returnCondition && (picked.returnCondition !== 'NONE' || Boolean(picked.damageItems?.length)) && (
              <Box sx={{ mt: 5 }}>
                <DamageItemsField noDamage={picked.returnCondition === 'NONE'} />
              </Box>
            )}
            <TextField
              label="Notes"
              multiline
              minRows={3}
              fullWidth
              placeholder="Any damage, missing parts, or a disagreement. Also say why if you changed where the bike goes."
              sx={{ mt: 5 }}
              {...form.register('note')}
              error={Boolean(form.formState.errors.note)}
              helperText={form.formState.errors.note?.message}
            />
          </Panel>

          <Panel
            label="Money"
            subtitle="Only the rent is settled here. Damage is not priced yet."
          >
            {/* A number input hands back a string unless it is asked not to. */}
            <TextField
              label="Rent still owed (₹)"
              type="number"
              fullWidth
              {...form.register('outstandingRentRupees', { valueAsNumber: true })}
              error={Boolean(form.formState.errors.outstandingRentRupees)}
              helperText={form.formState.errors.outstandingRentRupees?.message ?? `Our records show ${rupeesWithSymbol(Math.max(0, outstanding))} owed this week. Type what the desk agreed.`}
            />
            <Box sx={{ mt: 5 }}>
              <DerivedField
                label="Deposit left after rent owed"
                value={netLabel}
                derivation="Deposit held − rent still owed. Negative means the rent owed is more than the deposit covers."
              />
            </Box>
            <Alert severity="info" sx={{ mt: 4 }}>
              Do not guess a damage deduction here. The bike has to be checked first. Whatever the repair
              costs is decided on the service job, and if it is set to come out of the deposit, it is taken
              off then. The rider is refunded after that.
            </Alert>
          </Panel>
          </Box>

          {/* Sticky so it follows the form down. On a narrow screen it simply
              lands last, which is the order the operator reads anyway: fill
              the form, then check what it is about to do. */}
          <Box sx={{ position: { lg: 'sticky' }, top: 16, minWidth: 0 }}>
            <Panel
              label="Before you finish"
              subtitle="Here is what will happen when you confirm."
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
                    label: 'Deposit left, before repairs',
                    value: (
                      <Mono sx={{ fontSize: 13 }}>
                        {rupeesWithSymbol(refundPaise)}
                      </Mono>
                    ),
                  },
                  { label: 'Rider becomes', value: 'Inactive' },
                ]}
              />
              <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 3 }}>
                The bike movement and the service job are saved together. The job shows up in Bikes in service straight away.
              </Typography>
              <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 4 }}>
                The rider becomes inactive and the bike is freed up. Onboard them again to bring
                them back.
              </Typography>
              <FormControlLabel sx={{ mt: 3 }} control={<Checkbox checked={confirmed} onChange={(e) => setConfirmedValues(e.target.checked ? confirmationKey : '')} />} label="I confirm the rider, where the bike goes, and the money." />
            </Panel>
          </Box>
        </Box>
      </Box>
      <ConfirmDialog
        open={confirmOpen}
        title="Finish and take the bike back?"
        message="The rider is decoupled from the bike and the settlement is final."
        info={pendingValues ? `${rupeesWithSymbol(outstanding)} of rent is settled${net >= 0 ? ` and ${rupeesWithSymbol(net)} of deposit is refunded` : ' — the deposit does not cover the rent owed'}. The bike goes to ${VEHICLE_STATE_LABEL[pendingValues.nextVehicleState]}.` : undefined}
        confirmLabel="Finish and take the bike back"
        tone="bad"
        dismissible={false}
        pending={save.isPending}
        onConfirm={() => { setConfirmOpen(false); if (pendingValues) save.mutate(pendingValues); }}
        onCancel={() => setConfirmOpen(false)}
      />
    </FormProvider>
  );
}