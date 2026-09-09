import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import { useFormContext } from 'react-hook-form';
import { StepSection } from '../../../components/StepSection';
import { VerifyField } from '../../../components/VerifyField';
import type { useRiderVerification } from './useRiderVerification';

interface Props {
  step: number;
  verification: ReturnType<typeof useRiderVerification>;
}

/**
 * Step 1 — Identity: Aadhaar (verified), name, permanent address.
 *
 * Aadhaar is the record the team actually trusts. The number goes through the
 * OTP round-trip like every other contact field, keeping the gate consistent.
 * Name and address are plain text fields on the same form.
 */
export function RiderIdentityStep({ step, verification }: Props) {
  const { register, formState, setValue, watch } = useFormContext();

  const aadhaarValue = watch('aadhaarNumber') ?? '';

  const fieldError = (name: string) => {
    const err = formState.errors[name] as { message?: string } | undefined;
    return {
      error: Boolean(err),
      helperText: err?.message,
    };
  };

  const handleAadhaarChange = (next: string) => {
    setValue('aadhaarNumber', next, { shouldValidate: formState.isSubmitted });
    verification.onValueChange('aadhaar');
  };

  return (
    <StepSection step={step} title="Identity" subtitle="Aadhaar is the primary identity record.">
      <Box sx={{ display: 'grid', gap: 5 }}>
        <VerifyField
          label="01. Aadhaar number"
          value={aadhaarValue}
          onValueChange={handleAadhaarChange}
          code={verification.codeOf('aadhaar')}
          onCodeChange={(c) => verification.setCode('aadhaar', c)}
          state={verification.stateOf('aadhaar')}
          onSend={() => verification.send('aadhaar')}
          onVerify={() => verification.verify('aadhaar')}
          placeholder="12 digit Aadhaar number"
          codeLabel="OTP"
          maxLength={12}
          error={fieldError('aadhaarNumber').error ? fieldError('aadhaarNumber').helperText : undefined}
          note="The Aadhaar number will be verified via OTP sent to the linked mobile."
        />

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 5 }}>
          <TextField
            label="Full name"
            placeholder="As on Aadhaar"
            {...register('name')}
            error={fieldError('name').error}
            helperText={fieldError('name').helperText}
          />

          <TextField
            label="Permanent address"
            placeholder="Address as per Aadhaar"
            {...register('permanentAddress')}
            error={fieldError('permanentAddress').error}
            helperText={fieldError('permanentAddress').helperText}
            slotProps={{ htmlInput: { multiline: true, minRows: 2 } }}
            sx={{ gridColumn: { xs: '1 / -1', sm: '1 / -1' } }}
          />
        </Box>
      </Box>
    </StepSection>
  );
}
