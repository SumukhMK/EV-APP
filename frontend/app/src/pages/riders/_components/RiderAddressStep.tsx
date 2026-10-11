import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import { useEffect } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { SelectField } from '../../../components/form/SelectField';
import { MandatoryLabel } from '../../../components/form/MandatoryLabel';
import { InfoTip } from '../../../components/InfoTip';
import { INDIA_STATES, citiesOf } from '../../../lib/indiaPlaces';
import { StepSection } from '../../../components/StepSection';
import { digitsOnly, licenceMask, panMask } from '../../../lib/inputFormat';

/**
 * Step 3 — Address: where the rider lives, and where a bike can be recovered
 * from. PAN and driving licence fold in here — two optional fields do not
 * earn a section of their own, and the prototype labels them "(optional)".
 *
 * Reads the parent form via RHF context, like every other step, so the
 * parent stays readable at six steps.
 */
export function RiderAddressStep({ step }: { step: number }) {
  const { register, formState, control, setValue } = useFormContext();

  // State first, then the cities of that state. A city picked for another
  // state is cleared, so the pair can never disagree.
  const state = useWatch({ control, name: 'state' }) as string | undefined;
  const city = useWatch({ control, name: 'city' }) as string | undefined;
  const cities = citiesOf(state);
  useEffect(() => {
    if (city && !cities.includes(city)) {
      setValue('city', '', { shouldValidate: Boolean(state) });
    }
  }, [state, city, cities, setValue]);

  const fieldError = (name: string) => {
    const err = formState.errors[name] as { message?: string } | undefined;
    return {
      error: Boolean(err),
      helperText: err?.message,
    };
  };

  return (
    <StepSection
      step={step}
      title="Address"
      info="Where the rider lives, and where a bike can be recovered from."
    >
      <Box sx={{ display: 'grid', gap: 5 }}>
        <TextField
          label={<>Local address <MandatoryLabel /></>}
          placeholder="House, street, area"
          multiline
          minRows={2}
          {...register('localAddress')}
          error={fieldError('localAddress').error}
          helperText={fieldError('localAddress').helperText}
        />

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)' },
            gap: 5,
          }}
        >
          <SelectField
            control={control}
            name="state"
            label={<>State <MandatoryLabel /></>}
            searchable
            placeholder="Type to search"
            options={INDIA_STATES.map((name) => ({ value: name, label: name }))}
          />
          <SelectField
            control={control}
            name="city"
            label={<>City <MandatoryLabel /></>}
            searchable
            placeholder={state ? 'Type to search' : 'Pick the state first'}
            options={cities.map((name) => ({ value: name, label: name }))}
          />
          <TextField
            label={<>PIN code <MandatoryLabel /></>}
            inputMode="numeric"
            slotProps={{ htmlInput: { maxLength: 6 } }}
            {...register('pinCode', {
              onChange: (e) => {
                e.target.value = digitsOnly(e.target.value, 6);
              },
            })}
            error={fieldError('pinCode').error}
            helperText={fieldError('pinCode').helperText}
          />
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 5 }}>
          <TextField
            label={<>PAN number (optional) <InfoTip title="Five letters, four digits, one letter" /></>}
            placeholder="ABCDE1234F"
            // Each position only takes the kind of character that belongs
            // there — five letters, four digits, one letter.
            {...register('panNumber', {
              onChange: (e) => {
                e.target.value = panMask(e.target.value);
              },
            })}
            error={fieldError('panNumber').error}
            helperText={fieldError('panNumber').helperText}
          />
          <TextField
            label={<>Driving licence (optional) <InfoTip title="State code, RTO, year, then the serial" /></>}
            placeholder="KA0120239876543"
            {...register('drivingLicence', {
              onChange: (e) => {
                e.target.value = licenceMask(e.target.value);
              },
            })}
            error={fieldError('drivingLicence').error}
            helperText={fieldError('drivingLicence').helperText}
          />
        </Box>
      </Box>
    </StepSection>
  );
}