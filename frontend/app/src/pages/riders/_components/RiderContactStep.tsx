import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import { useFormContext } from 'react-hook-form';
import { StepSection } from '../../../components/StepSection';
import { VerifyField } from '../../../components/VerifyField';
import { digitsOnly } from '../../../lib/inputFormat';
import type { VerifiableField, useRiderVerification } from './useRiderVerification';

interface Props {
  step: number;
  verification: ReturnType<typeof useRiderVerification>;
}

/** The numbers the team collects, in the order the prototype shows them. */
const CONTACT_FIELDS: Array<{
  key: VerifiableField;
  label: string;
  formName: string;
  codeLabel: string;
  placeholder: string;
}> = [
  { key: 'primary', label: '02. Primary mobile number', formName: 'phone', codeLabel: 'OTP', placeholder: '10 digit mobile number' },
  { key: 'whatsapp', label: '03. WhatsApp number', formName: 'whatsappNumber', codeLabel: 'code', placeholder: '10 digit WhatsApp number' },
  { key: 'alt1', label: '04. Alternate number', formName: 'alternateNumber1', codeLabel: 'OTP', placeholder: '10 digit alternate number' },
];

/**
 * Step 2 — Contact: three verified phone numbers.
 *
 * One spare beside the rider's own: the counter asks for a single alternate,
 * and the second slot only ever came back empty. WhatsApp uses "code" instead
 * of "OTP" — the team says both, and the distinction matters at the counter.
 *
 * Most riders give the same number for WhatsApp, so that is a tick box rather
 * than a second thing to type and verify: ticking it copies the primary number
 * across and carries its verified state, because it is the same number and the
 * same proof.
 */
export function RiderContactStep({ step, verification }: Props) {
  const { setValue, watch, formState } = useFormContext();

  const primary = (watch('phone') as string) ?? '';
  const whatsapp = (watch('whatsappNumber') as string) ?? '';
  const sameAsPrimary = primary.length > 0 && primary === whatsapp;

  const toggleSameAsPrimary = (checked: boolean) => {
    setValue('whatsappNumber', checked ? primary : '', {
      shouldValidate: formState.isSubmitted,
    });
    verification.setSameAsPrimary('whatsapp', checked);
  };

  return (
    <StepSection
      step={step}
      title="Contact numbers"
      subtitle="All three must be verified before the rider can be deployed."
    >
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
          gap: 5,
        }}
      >
        {CONTACT_FIELDS.map(({ key, label, formName, codeLabel, placeholder }) => {
          const value = (watch(formName) as string) ?? '';
          const err = formState.errors[formName] as { message?: string } | undefined;
          const isWhatsapp = key === 'whatsapp';
          const mirrored = isWhatsapp && sameAsPrimary;

          const handleChange = (next: string) => {
            // Digits only, capped at ten — a mobile number cannot contain
            // anything else, so the field refuses it rather than validating
            // after the fact.
            setValue(formName, digitsOnly(next, 10), {
              shouldValidate: formState.isSubmitted,
            });
            verification.onValueChange(key);
          };

          return (
            <Box key={key}>
              <VerifyField
                label={label}
                value={value}
                onValueChange={handleChange}
                code={verification.codeOf(key)}
                onCodeChange={(c) => verification.setCode(key, digitsOnly(c, 6))}
                state={verification.stateOf(key)}
                onSend={() => verification.send(key)}
                onVerify={() => verification.verify(key)}
                placeholder={placeholder}
                codeLabel={codeLabel}
                maxLength={10}
                error={err?.message}
                readOnly={mirrored}
                note={mirrored ? 'Same as the primary number — verified with it.' : undefined}
              />
              {isWhatsapp && (
                <FormControlLabel
                  sx={{ mt: 1.5, ml: 0.5 }}
                  control={
                    <Checkbox
                      size="small"
                      checked={sameAsPrimary}
                      disabled={primary.length !== 10}
                      onChange={(e) => toggleSameAsPrimary(e.target.checked)}
                    />
                  }
                  label="Same as primary number"
                  slotProps={{ typography: { sx: { fontSize: 13 } } }}
                />
              )}
            </Box>
          );
        })}
      </Box>
    </StepSection>
  );
}
