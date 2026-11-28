import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import { Controller, useFormContext } from 'react-hook-form';
import { StepSection } from '../../../components/StepSection';
import { DerivedField } from '../../../components/DerivedField';
import { DateField } from '../../../components/form/DateField';
import { SelectField } from '../../../components/form/SelectField';
import { MandatoryLabel } from '../../../components/form/MandatoryLabel';
import { digitsOnly } from '../../../lib/inputFormat';
import { InfoTip } from '../../../components/InfoTip';
import {
  DEPOSIT_TIERS,
  PAYMENT_METHOD_LABEL,
  WEEKLY_PLAN_TIERS,
  WORKING_PLATFORMS,
} from '../../../lib/labels';
import { rupeesWithSymbol } from '../../../lib/format';
import type { PaymentMode } from '../../../types';

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

  const depositRupees = Number(watch('depositRupees')) || 0;
  const depositPaidRupees = Number(watch('depositPaidRupees')) || 0;

  // Driven off the same label map the payment run and the receipt use, so the
  // mode agreed here can always be recorded against an actual collection.
  const paymentModeOptions = (Object.keys(PAYMENT_METHOD_LABEL) as PaymentMode[]).map((m) => ({
    value: m,
    label: PAYMENT_METHOD_LABEL[m],
  }));

  /**
   * A freeSolo money combobox: options are formatted, the value is whole rupees.
   * The box only ever holds digits, and what is typed is the value — freeSolo's
   * onChange fires only on a pick or Enter, so a typed amount was lost on Tab.
   */
  const moneyCombobox = (name: 'planRupees' | 'depositRupees', tiers: readonly number[]) => (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const text = Number.isFinite(field.value) && field.value > 0 ? String(field.value) : '';
        const commit = (raw: string) => {
          const digits = digitsOnly(raw, 6);
          field.onChange(digits === '' ? Number.NaN : Number(digits));
        };
        return (
          <Autocomplete
            freeSolo
            options={tiers.map((p) => rupeesWithSymbol(p))}
            // Typed digits never match "₹1,750", so every tier stays offered.
            filterOptions={(o) => o}
            value={text}
            inputValue={text}
            onInputChange={(_, next, reason) => {
              if (reason !== 'reset') commit(next);
            }}
            onChange={(_, next) => commit(String(next ?? ''))}
            renderInput={(params) => (
              <TextField
                {...params}
                label={<>{name === 'planRupees' ? 'Weekly plan (₹)' : 'Deposit plan (₹)'} <MandatoryLabel /></>}
                placeholder="Type an amount or pick a tier"
                error={Boolean(fieldState.error)}
                helperText={fieldState.error?.message}
                slotProps={{ ...params.slotProps, htmlInput: { ...params.slotProps.htmlInput, inputMode: 'numeric' } }}
              />
            )}
          />
        );
      }}
    />
  );

  return (
    <StepSection
      step={step}
      title="Commercial"
      info="The plan, the platform and the deposit. Money is in rupees."
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
                // Both the value and the text are the form field. freeSolo's
                // onChange fires only on a pick or an Enter, so a platform
                // typed and then tabbed away from was lost; onInputChange is
                // what makes the typed text the value.
                value={field.value ?? ''}
                inputValue={field.value ?? ''}
                onInputChange={(_, text) => field.onChange(text)}
                onChange={(_, next) => field.onChange(typeof next === 'string' ? next : (next ?? ''))}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label={<>Working platform <MandatoryLabel /></>}
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
            label={<>Billing day <MandatoryLabel /></>}
            options={[
              { value: 'MONDAY', label: 'Monday' },
              { value: 'TUESDAY', label: 'Tuesday' },
              { value: 'WEDNESDAY', label: 'Wednesday' },
              { value: 'THURSDAY', label: 'Thursday' },
              { value: 'FRIDAY', label: 'Friday' },
              { value: 'SATURDAY', label: 'Saturday' },
              { value: 'SUNDAY', label: 'Sunday' },
            ]}
          />

          <SelectField
            control={control}
            name="paymentMode"
            label={<>Mode of payment <MandatoryLabel /> <InfoTip title="The standing arrangement, shown on the register. Each collection still records how that week's money actually arrived, so a UPI rider paying cash once stays a UPI rider." /></>}
            options={paymentModeOptions}
          />

          {moneyCombobox('depositRupees', DEPOSIT_TIERS)}
          <Controller
            control={control}
            name="depositPaidRupees"
            render={({ field, fieldState }) => (
              <TextField
                label={<>Deposit paid (₹) <MandatoryLabel /></>}
                value={Number.isFinite(field.value) ? String(field.value) : ''}
                onChange={(e) => {
                  const digits = digitsOnly(e.target.value, 6);
                  field.onChange(digits === '' ? Number.NaN : Number(digits));
                }}
                onBlur={field.onBlur}
                inputRef={field.ref}
                error={Boolean(fieldState.error)}
                helperText={fieldState.error?.message}
                slotProps={{ htmlInput: { inputMode: 'numeric' } }}
              />
            )}
          />

          <DerivedField
            label="Security deposit pending"
            value={rupeesWithSymbol(Math.max(0, (depositRupees - depositPaidRupees) * 100))}
            derivation={`Plan ${rupeesWithSymbol(depositRupees * 100)} − paid ${rupeesWithSymbol(depositPaidRupees * 100)}`}
          />
          <DateField
            label={<>Onboarded on <MandatoryLabel /></>}
            labelText="Onboarded on"
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
