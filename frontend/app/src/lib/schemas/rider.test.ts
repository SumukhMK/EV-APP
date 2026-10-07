import { describe, expect, it } from 'vitest';
import { ONBOARD_RIDER_DEFAULTS, onboardRiderSchema } from './rider';

/**
 * The two address boxes are required multiline fields, and the two ways of
 * getting one wrong say different things: an empty box is a missing field, a
 * one-to-four-character box is a too-short one. The schema is where that
 * sentence lives — the field renders whatever message it returns.
 */
const valid = {
  ...ONBOARD_RIDER_DEFAULTS,
  aadhaarNumber: '123456789012',
  name: 'Test Rider',
  permanentAddress: 'HSR Layout, Bengaluru',
  phone: '9000000001',
  whatsappNumber: '9000000001',
  alternateNumber1: '9000000002',
  localAddress: 'HSR Layout',
  city: 'Bengaluru',
  state: 'Karnataka',
  pinCode: '560102',
  workingPlatform: 'Zomato',
};

describe('onboardRiderSchema permanent address', () => {
  it('accepts a real address', () => {
    expect(onboardRiderSchema.safeParse({ ...valid, permanentAddress: 'HSR Layout, Bengaluru' }).success).toBe(true);
  });

  it('says the address is required when nothing is entered', () => {
    const result = onboardRiderSchema.safeParse({ ...valid, permanentAddress: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((i) => i.message)).toContain('Permanent address is required');
    }
  });

  it('treats whitespace-only input as empty', () => {
    const result = onboardRiderSchema.safeParse({ ...valid, permanentAddress: '   ' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((i) => i.message)).toContain('Permanent address is required');
    }
  });

  it.each(['ab', 'abcd'])('asks for at least 5 characters when %s is entered', (permanentAddress) => {
    const result = onboardRiderSchema.safeParse({ ...valid, permanentAddress });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((i) => i.message)).toContain('Min 5 characters required');
    }
  });

  it('rejects an address over 200 characters', () => {
    const result = onboardRiderSchema.safeParse({ ...valid, permanentAddress: 'x'.repeat(201) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((i) => i.message)).toContain('Address is too long');
    }
  });
});

describe('onboardRiderSchema local address', () => {
  it('accepts a real address', () => {
    expect(onboardRiderSchema.safeParse({ ...valid, localAddress: 'HSR Layout, Bengaluru' }).success).toBe(true);
  });

  it('says the address is required when nothing is entered', () => {
    const result = onboardRiderSchema.safeParse({ ...valid, localAddress: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((i) => i.message)).toContain('Local address is required');
    }
  });

  it('treats whitespace-only input as empty', () => {
    const result = onboardRiderSchema.safeParse({ ...valid, localAddress: '   ' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((i) => i.message)).toContain('Local address is required');
    }
  });

  it.each(['ab', 'abcd'])('asks for at least 5 characters when %s is entered', (localAddress) => {
    const result = onboardRiderSchema.safeParse({ ...valid, localAddress });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((i) => i.message)).toContain('Min 5 characters required');
    }
  });

  it('rejects an address over 200 characters', () => {
    const result = onboardRiderSchema.safeParse({ ...valid, localAddress: 'x'.repeat(201) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((i) => i.message)).toContain('Address is too long');
    }
  });
});