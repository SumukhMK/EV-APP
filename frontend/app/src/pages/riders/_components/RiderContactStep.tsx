import Box from '@mui/material/Box';
import { useFormContext } from 'react-hook-form';
import { StepSection } from '../../../components/StepSection';
import { VerifyField } from '../../../components/VerifyField';
import type { VerifiableField, useRiderVerification } from './useRiderVerification';

interface Props {
  step: number;
  verification: ReturnType<typeof useRiderVerification>;
}

/** The four numbers the team collects, in the order the prototype shows them. */
const CONTACT_FIELDS: Array<{
  key: VerifiableField;
  label: string;
  formName: string;
  codeLabel: string;
  placeholder: string;
}> = [
  { key: 'primary', label: '02. Primary mobile number', formName: 'phone', codeLabel: 'OTP', placeholder: '10 digit mobile number' },
  { key: 'whatsapp', label: '03. WhatsApp number', formName: 'whatsappNumber', codeLabel: 'code', placeholder: '10 digit WhatsApp number' },
  { key: 'alt1', label: '04. Alternate number 1', formName: 'alternateNumber1', codeLabel: 'OTP', placeholder: '10 digit alternate number' },
  { key: 'alt2', label: '05. Alternate number 2', formName: 'alternateNumber2', codeLabel: 'OTP', placeholder: '10 digit alternate number' },
];

/**
 * Step 2 — Contact: four verified phone numbers.
 *
 * The team collects four because a rider is often unreachable on the number
 * they gave at the counter by the time a bike needs recovering. WhatsApp uses
 * "code" instead of "OTP" — the team says both, and the distinction matters
 * at the counter.
 */
export function RiderContactStep({ step, verification }: Props) {
  const { setValue, watch, formState } = useFormContext();

  return (
    <StepSection
      step={step}
      title="Contact numbers"
      subtitle="All four must be verified before the rider can be deployed."
    >
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
          gap: 5,
        }}
      >
        {CONTACT_FIELDS.map(({ key, label, formName, codeLabel, placeholder }) => {
          const value = watch(formName) ?? '';
          const err = formState.errors[formName] as { message?: string } | undefined;

          const handleChange = (next: string) => {
            setValue(formName, next, { shouldValidate: formState.isSubmitted });
            verification.onValueChange(key);
          };

          return (
            <VerifyField
              key={key}
              label={label}
              value={value}
              onValueChange={handleChange}
              code={verification.codeOf(key)}
              onCodeChange={(c) => verification.setCode(key, c)}
              state={verification.stateOf(key)}
              onSend={() => verification.send(key)}
              onVerify={() => verification.verify(key)}
              placeholder={placeholder}
              codeLabel={codeLabel}
              maxLength={10}
              error={err?.message}
            />
          );
        })}
      </Box>
    </StepSection>
  );
}
