import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import { useFormContext } from 'react-hook-form';
import { StepSection } from '../../../components/StepSection';

/**
 * Step 3 — Address: where the rider lives, and where a bike can be recovered
 * from. PAN and driving licence fold in here — two optional fields do not
 * earn a section of their own, and the prototype labels them "(optional)".
 *
 * Reads the parent form via RHF context, like every other step, so the
 * parent stays readable at six steps.
 */
export function RiderAddressStep({ step }: { step: number }) {
  const { register, formState } = useFormContext();

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
      subtitle="Where the rider lives, and where a bike can be recovered from."
    >
      <Box sx={{ display: 'grid', gap: 5 }}>
        <TextField
          label="Local address"
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
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(4, 1fr)' },
            gap: 5,
          }}
        >
          <TextField
            label="City"
            {...register('city')}
            error={fieldError('city').error}
            helperText={fieldError('city').helperText}
          />
          <TextField
            label="State"
            {...register('state')}
            error={fieldError('state').error}
            helperText={fieldError('state').helperText}
          />
          <TextField
            label="PIN code"
            inputMode="numeric"
            slotProps={{ htmlInput: { maxLength: 6 } }}
            {...register('pinCode', {
              pattern: { value: /^\d{6}$/, message: 'PIN must be exactly 6 digits' },
            })}
            error={fieldError('pinCode').error}
            helperText={fieldError('pinCode').helperText}
          />
          <TextField
            label="Location coordinates"
            placeholder="12.892425,77.649213"
            {...register('locationCoordinates')}
            error={fieldError('locationCoordinates').error}
            helperText={fieldError('locationCoordinates').helperText}
          />
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 5 }}>
          <TextField
            label="PAN number (optional)"
            placeholder="ABCDE1234F"
            {...register('panNumber', {
              // Empty is fine; a filled PAN must look like one.
              validate: (v) =>
                !v || /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v) || 'Enter PAN as ABCDE1234F',
            })}
            error={fieldError('panNumber').error}
            helperText={fieldError('panNumber').helperText}
          />
          <TextField
            label="Driving licence (optional)"
            placeholder="Licence number"
            {...register('drivingLicence')}
            error={fieldError('drivingLicence').error}
            helperText={fieldError('drivingLicence').helperText}
          />
        </Box>
      </Box>
    </StepSection>
  );
}