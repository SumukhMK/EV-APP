import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { StateChip } from './StateChip';
import type { StatusTone } from '../theme/tokens';

export type VerificationState = 'UNVERIFIED' | 'CODE_SENT' | 'VERIFYING' | 'VERIFIED' | 'FAILED';

const STATE_LABEL: Record<VerificationState, string> = {
  UNVERIFIED: 'Not verified',
  CODE_SENT: 'Code sent',
  VERIFYING: 'Verifying',
  VERIFIED: 'Verified',
  FAILED: 'Verification failed',
};

const STATE_TONE: Record<VerificationState, StatusTone> = {
  UNVERIFIED: 'neutral',
  CODE_SENT: 'caution',
  VERIFYING: 'caution',
  VERIFIED: 'good',
  FAILED: 'bad',
};

export interface VerifyFieldProps {
  label: string;
  value: string;
  onValueChange: (next: string) => void;
  code: string;
  onCodeChange: (next: string) => void;
  state: VerificationState;
  onSend: () => void;
  onVerify: () => void;
  placeholder?: string;
  /** "OTP" for a mobile number, "code" for WhatsApp — the team says both. */
  codeLabel?: string;
  maxLength?: number;
  error?: string;
  note?: string;
  /** The value is mirrored from another field, so it cannot be edited here. */
  readOnly?: boolean;
}

/**
 * One identity field that has to be proved, not just typed: the number, the
 * code that was sent to it, and where that round-trip has got to.
 *
 * It is a component because a rider cannot be deployed until five of these
 * read VERIFIED, and that gate is only trustworthy if all five report their
 * state the same way. The caller owns the state machine — this draws it and
 * locks the inputs once VERIFIED so a verified number cannot be edited out
 * from under its own proof.
 */
export function VerifyField({
  label,
  value,
  onValueChange,
  code,
  onCodeChange,
  state,
  onSend,
  onVerify,
  placeholder,
  codeLabel = 'OTP',
  maxLength,
  error,
  note,
  readOnly = false,
}: VerifyFieldProps) {
  const verified = state === 'VERIFIED';
  const busy = state === 'VERIFYING';

  return (
    <Box
      sx={{
        p: '14px 14px 12px',
        borderRadius: 2,
        border: 1,
        borderColor: 'divider',
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
      }}
    >
      <Typography variant="overline">{label}</Typography>

      <TextField
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder={placeholder}
        disabled={verified || readOnly}
        error={Boolean(error)}
        helperText={error}
        slotProps={{ htmlInput: { inputMode: 'numeric', maxLength } }}
      />

      <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
        <TextField
          value={code}
          onChange={(e) => onCodeChange(e.target.value)}
          placeholder={`Enter ${codeLabel}`}
          disabled={verified || readOnly || state === 'UNVERIFIED'}
          sx={{ flex: 1 }}
        />
        <Button variant="outlined" onClick={onSend} disabled={verified || readOnly || busy || !value}>
          {state === 'UNVERIFIED' ? `Send ${codeLabel}` : `Resend ${codeLabel}`}
        </Button>
        <Button variant="outlined" onClick={onVerify} disabled={verified || readOnly || busy || !code}>
          Verify
        </Button>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <StateChip label={STATE_LABEL[state]} tone={STATE_TONE[state]} />
        {note && <Typography sx={{ fontSize: 12, color: 'grey.500' }}>{note}</Typography>}
      </Box>
    </Box>
  );
}
