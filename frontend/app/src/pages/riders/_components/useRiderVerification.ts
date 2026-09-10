import { useCallback, useMemo, useState } from 'react';
import type { RiderVerification } from '../../../types';
import type { VerificationState } from '../../../components/VerifyField';

export type VerifiableField = 'aadhaar' | 'primary' | 'whatsapp' | 'alt1';

const ALL_FIELDS: VerifiableField[] = ['aadhaar', 'primary', 'whatsapp', 'alt1'];

/** Maps the four verification slots to their corresponding form field names. */
export const FIELD_FORM_MAP: Record<VerifiableField, string> = {
  aadhaar: 'aadhaarNumber',
  primary: 'phone',
  whatsapp: 'whatsappNumber',
  alt1: 'alternateNumber1',
};

/**
 * State machine for the four identity fields that must be proved before a
 * rider can be onboarded. Each field goes through:
 *
 *   UNVERIFIED → CODE_SENT → VERIFYING → VERIFIED
 *                                    ↘ FAILED
 *
 * Editing a verified number resets it to UNVERIFIED — the code was sent to the
 * old value, so the proof no longer holds.
 *
 * The six-digit rule is a placeholder for the endpoint that nobody has
 * specified yet, per the Phase 1 rule: nothing invented where a rule is
 * unknown.
 */
export function useRiderVerification() {
  const [states, setStates] = useState<Record<VerifiableField, VerificationState>>({
    aadhaar: 'UNVERIFIED',
    primary: 'UNVERIFIED',
    whatsapp: 'UNVERIFIED',
    alt1: 'UNVERIFIED',
  });

  const [codes, setCodes] = useState<Record<VerifiableField, string>>({
    aadhaar: '',
    primary: '',
    whatsapp: '',
    alt1: '',
  });

  /** If a field was verified, editing resets it so the proof cannot go stale. */
  const onValueChange = useCallback((field: VerifiableField) => {
    setStates((prev) => {
      if (prev[field] === 'VERIFIED') return { ...prev, [field]: 'UNVERIFIED' };
      return prev;
    });
  }, []);

  const send = useCallback((field: VerifiableField) => {
    // Resend from FAILED also works — moves back to CODE_SENT.
    setStates((prev) => ({
      ...prev,
      [field]: 'CODE_SENT',
    }));
  }, []);

  const verify = useCallback((field: VerifiableField) => {
    setStates((prev) => {
      if (prev[field] !== 'CODE_SENT') return prev;
      return { ...prev, [field]: 'VERIFYING' };
    });

    // Placeholder: accept any 6-digit code. The real endpoint will replace
    // this setTimeout and the six-digit gate.
    setTimeout(() => {
      setCodes((prev) => {
        const code = prev[field];
        setStates((s) => ({
          ...s,
          [field]: code.length === 6 ? 'VERIFIED' : 'FAILED',
        }));
        return prev;
      });
    }, 300);
  }, []);

  const invalidate = useCallback((field: VerifiableField) => {
    setStates((prev) => {
      if (prev[field] === 'VERIFIED') return { ...prev, [field]: 'UNVERIFIED' };
      return prev;
    });
  }, []);

  const setCode = useCallback((field: VerifiableField, code: string) => {
    setCodes((prev) => ({ ...prev, [field]: code }));
  }, []);

  /**
   * Mirror one field's proof onto another — used when WhatsApp is ticked as
   * "same as primary". It is the same number, so it carries the same state
   * rather than asking the counter to send a second code to it, and it keeps
   * tracking the primary if that is verified later. Unticking drops it back to
   * unverified, because the field is then empty again.
   */
  const [mirrorsPrimary, setMirrorsPrimary] = useState(false);

  const setSameAsPrimary = useCallback((field: VerifiableField, same: boolean) => {
    if (field !== 'whatsapp') return;
    setMirrorsPrimary(same);
    if (!same) setStates((prev) => ({ ...prev, whatsapp: 'UNVERIFIED' }));
  }, []);

  /** The effective state of a field, after mirroring. */
  const stateOf = useCallback(
    (f: VerifiableField): VerificationState =>
      f === 'whatsapp' && mirrorsPrimary ? states.primary : states[f],
    [mirrorsPrimary, states],
  );

  const allVerified = useMemo(
    () => ALL_FIELDS.every((f) => stateOf(f) === 'VERIFIED'),
    [stateOf],
  );

  const asRequest = useCallback((): RiderVerification => ({
    aadhaarVerified: stateOf('aadhaar') === 'VERIFIED',
    primaryVerified: stateOf('primary') === 'VERIFIED',
    whatsappVerified: stateOf('whatsapp') === 'VERIFIED',
    alternate1Verified: stateOf('alt1') === 'VERIFIED',
  }), [stateOf]);

  const outstanding = useMemo(
    () => ALL_FIELDS.filter((f) => stateOf(f) !== 'VERIFIED'),
    [stateOf],
  );

  return {
    stateOf,
    codeOf: (f: VerifiableField) => codes[f],
    setCode,
    setSameAsPrimary,
    onValueChange,
    send,
    verify,
    invalidate,
    allVerified,
    asRequest,
    outstanding,
  };
}
