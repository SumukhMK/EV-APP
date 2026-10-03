import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

export type VerificationState = 'UNVERIFIED' | 'CODE_SENT' | 'VERIFYING' | 'VERIFIED' | 'FAILED';

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
  state,
  placeholder,
  maxLength,
  error,
  note,
  readOnly = false,
}: VerifyFieldProps) {
  const verified = state === 'VERIFIED';

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

      {/*
        The OTP box and its Send and Verify buttons used to sit here.
        There is no verification service behind them — any six digits passed —
        so they were a gate that proved nothing while looking like proof, and
        they blocked onboarding until somebody typed 123456 four times.

        They are gone rather than disabled: a control that cannot do its job
        is worse than its absence, because the next person assumes it works.
        The props stay on this component so the step files are untouched and
        the OTP flow is a re-render away once a provider exists.
      */}
      {note && <Typography sx={{ fontSize: 12, color: 'grey.500' }}>{note}</Typography>}
    </Box>
  );
}
