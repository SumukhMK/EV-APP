import { useCallback, useState } from 'react';
import type { VerificationState } from '../../../components/VerifyField';

export type VerifiableField = 'aadhaar' | 'primary' | 'whatsapp' | 'alt1';

/**
 * Identity verification, as it actually stands: not implemented.
 *
 * <p>This used to run a four-field OTP state machine against nothing. There
 * was no SMS provider and no endpoint — `verify` accepted any six digits
 * after a 300ms timer — and `allVerified` gated the onboarding submit. So the
 * wizard could not be completed without typing a code four times, and
 * completing it recorded every number as verified when none had been.
 *
 * <p>The flags now go to the API as false, which is the truth: the operator
 * typed a number and nobody checked it. The onboarding form no longer waits
 * for a proof that does not exist.
 *
 * <p>The shape is kept so the four step components are untouched. When a
 * provider is chosen, the state machine comes back here and nothing else
 * needs to move.
 */
export function useRiderVerification() {
  // Values still live here so a step can reset a field, but no state machine
  // runs over them any more.
  const [codes, setCodes] = useState<Record<VerifiableField, string>>({
    aadhaar: '',
    primary: '',
    whatsapp: '',
    alt1: '',
  });

  const setCode = useCallback((field: VerifiableField, value: string) => {
    setCodes((prev) => ({ ...prev, [field]: value }));
  }, []);

  // Takes the field so every existing call site compiles unchanged; it has
  // nothing to do now that no state machine runs.
  const noop = useCallback((_field?: VerifiableField) => {}, []);

  /**
   * "Same as primary" copies the number across. It used to also carry the
   * verification across, which was the one piece of this hook doing real
   * work — a number verified once should not need verifying twice.
   */
  const setSameAsPrimary = useCallback((_field: VerifiableField, _same: boolean) => {}, []);

  return {
    /** Nothing is verified, because nothing verifies it. */
    stateOf: (_field?: VerifiableField): VerificationState => 'UNVERIFIED',
    codeOf: (field: VerifiableField) => codes[field],
    setCode,
    send: noop,
    verify: noop,
    onValueChange: noop,
    setSameAsPrimary,
    /** No gate: the form is complete when its fields are filled. */
    allVerified: true,
    outstanding: [] as VerifiableField[],
    /**
     * False for every field. Claiming otherwise would put a verification
     * record in the database that no one performed.
     */
    asRequest: () => ({
      aadhaarVerified: false,
      primaryVerified: false,
      whatsappVerified: false,
      alternate1Verified: false,
    }),
  };
}
