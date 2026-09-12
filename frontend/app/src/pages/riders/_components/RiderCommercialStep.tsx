import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import { Controller, useFormContext } from 'react-hook-form';
import { StepSection } from '../../../components/StepSection';
import { DerivedField } from '../../../components/DerivedField';
import { DateField } from '../../../components/form/DateField';
import { SelectField } from '../../../components/form/SelectField';
import { InfoStrip } from '../../../components/InfoStrip';
import {
  DEPOSIT_TIERS,
  PAYMENT_DAY_LABEL,
  PAYMENT_METHOD_LABEL,
  WEEKLY_PLAN_TIERS,
  WORKING_PLATFORMS,
} from '../../../lib/labels';
import { rupeesWithSymbol } from '../../../lib/format';
import type { PaymentDay, PaymentMode } from '../../../types';

/**
 * Step 4 — Commercial: the plan, the platform and the deposit.
 *
 * Working platform and the two money fields are freeSolo comboboxes: the
 * tiers are suggestions, not a closed list — Ashok changes them, and a rider
 * can be on a plan nobody has seen yet. The tiers live in paise (they are a
 * price list, not a schema) and the form deals in rupees, so the options are
 * formatted on the way in and the typed value is parsed back to whole rupees.
 *
 * The deposit pending figure is deliberately a DerivedField, not an input:
 * a box that looks like an input invites someone to correct the arithmetic.
 */
export function RiderCommercialStep({ step }: { step: number }) {
  const { control, register, formState, watch, setValue } = useFormContext();

  const fieldError = (name: string) => {
    const err = formState.errors[name] as { message?: string } | undefined;
    return {
      error: Boolean(err),
      helperText: err?.message,
    };
  };

  const depositRupees = watch('depositRupees') ?? 0;
  const depositPaidRupees = watch('depositPaidRupees') ?? 0;

  const paymentDayOptions = (Object.keys(PAYMENT_DAY_LABEL) as PaymentDay[]).map((d) => ({
    value: d,
    label: PAYMENT_DAY_LABEL[d],
  }));

  // Driven off the same label map the payment run and the receipt use, so the
  // mode agreed here can always be recorded against an actual collection.
  const paymentModeOptions = (Object.keys(PAYMENT_METHOD_LABEL) as PaymentMode[]).map((m) => ({
    value: m,
    label: PAYMENT_METHOD_LABEL[m],
  }));

  /** A freeSolo money combobox: options are formatted, the value is whole rupees. */
  const moneyCombobox = (name: 'planRupees' | 'depositRupees', tiers: readonly number[]) => (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Autocomplete
          freeSolo
          options={tiers.map((p) => rupeesWithSymbol(p))}
          value={field.value ? String(field.value) : ''}
          onChange={(_, next) => {
            const n = Number(String(next ?? '').replace(/[^\d]/g, ''));
            field.onChange(Number.isFinite(n) && n > 0 ? n : 0);
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              label={name === 'planRupees' ? 'Weekly plan (₹)' : 'Deposit plan (₹)'}
              placeholder="Type an amount or pick a tier"
              error={Boolean(fieldState.error)}
              helperText={fieldState.error?.message}
            />
          )}
        />
      )}
    />
  );

  return (
    <StepSection
      step={step}
      title="Commercial"
      subtitle="The plan, the platform and the deposit. Money is in rupees."
    >
      <Box sx={{ display: 'grid', gap: 5 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 5 }}>
          <Controller
            control={control}
            name="workingPlatform"
            render={({ field }) => (
              <Autocomplete
                freeSolo
                options={[...WORKING_PLATFORMS]}
                value={field.value ?? ''}
                onChange={(_, next) => field.onChange(next ?? '')}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Working platform"
                    placeholder="Type or pick a platform"
                  />
                )}
              />
            )}
          />
          <TextField
            label="Platform rider id"
            placeholder="The id on the platform, if any"
            {...register('platformRiderId')}
            error={fieldError('platformRiderId').error}
            helperText={fieldError('platformRiderId').helperText}
          />

          {moneyCombobox('planRupees', WEEKLY_PLAN_TIERS)}
          <SelectField
            control={control}
            name="billingDay"
            label="Billing day"
            options={[
              { value: 'MONDAY', label: 'Monday' },
              { value: 'WEDNESDAY', label: 'Wednesday' },
            ]}
          />

          <SelectField control={control} name="paymentDay" label="Payment day" options={paymentDayOptions} />
          <InfoStrip>
            The weekly run is fixed Wednesday to Tuesday. This is recorded for the collections team
            and drives no calculation.
          </InfoStrip>

          <SelectField
            control={control}
            name="paymentMode"
            label="Mode of payment"
            options={paymentModeOptions}
          />
          <InfoStrip>
            The standing arrangement, shown on the register. Each collection still records how that
            week's money actually arrived, so a UPI rider paying cash once stays a UPI rider.
          </InfoStrip>

          {moneyCombobox('depositRupees', DEPOSIT_TIERS)}
          <TextField
            label="Deposit paid (₹)"
            type="number"
            {...register('depositPaidRupees', { valueAsNumber: true })}
            error={fieldError('depositPaidRupees').error}
            helperText={fieldError('depositPaidRupees').helperText}
          />

          <DerivedField
            label="Security deposit pending"
            value={rupeesWithSymbol(Math.max(0, (depositRupees - depositPaidRupees) * 100))}
            derivation={`Plan ${rupeesWithSymbol(depositRupees * 100)} − paid ${rupeesWithSymbol(depositPaidRupees * 100)}`}
          />
          <DateField
            label="Onboarded on"
            value={(watch('onboardedOn') as string) ?? ''}
            onChange={(next) =>
              setValue('onboardedOn', next, { shouldValidate: formState.isSubmitted })
            }
            error={fieldError('onboardedOn').error}
            helperText={fieldError('onboardedOn').helperText}
          />
        </Box>
      </Box>
    </StepSection>
  );
}