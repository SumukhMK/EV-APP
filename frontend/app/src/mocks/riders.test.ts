import { describe, expect, it } from 'vitest';
import { riders } from './riders';
import { onboardRider } from '../lib/api/riders';
import { PAYMENT_METHOD_LABEL } from '../lib/labels';
import { ONBOARD_RIDER_DEFAULTS, onboardRiderSchema } from '../lib/schemas/rider';
import type { OnboardRiderRequest, PaymentMode } from '../types';

const MODES: PaymentMode[] = ['UPI', 'CASH', 'BANK_TRANSFER'];

/** The defaults with every operator-typed field filled in, so the form validates. */
const FILLED_FORM = {
  ...ONBOARD_RIDER_DEFAULTS,
  aadhaarNumber: '123456789012',
  name: 'Test Rider',
  permanentAddress: 'Somewhere in Bengaluru',
  phone: '9000000001',
  whatsappNumber: '9000000001',
  alternateNumber1: '9000000002',
  localAddress: 'HSR Layout',
  city: 'Bengaluru',
  state: 'Karnataka',
  pinCode: '560102',
};

/**
 * `paymentMode` is the rider's standing arrangement, and it is deliberately the
 * same three values as a collection's `method`. These tests exist to keep that
 * true: the moment the two lists drift, the register can show an agreed mode
 * that the counter has no way to record a payment in.
 */
describe('rider payment mode', () => {
  it('is set on every rider in the register', () => {
    for (const r of riders) {
      expect(MODES, r.id).toContain(r.paymentMode);
    }
  });

  it('is labelled for every value it can hold', () => {
    // The register and the rider detail both render through this map. A value
    // with no label renders `undefined` in a table cell, silently.
    for (const mode of MODES) {
      expect(PAYMENT_METHOD_LABEL[mode]).toBeTruthy();
    }
    expect(Object.keys(PAYMENT_METHOD_LABEL).sort()).toEqual([...MODES].sort());
  });

  it('uses more than one mode across the fixture, so the column says something', () => {
    expect(new Set(riders.map((r) => r.paymentMode)).size).toBeGreaterThan(1);
  });

  it('is required by the onboarding schema', () => {
    // `ONBOARD_RIDER_DEFAULTS` is what the form *opens* with — deliberately
    // empty in the fields the operator must type — so it does not validate on
    // its own. These start from a filled form instead.
    expect(onboardRiderSchema.safeParse(FILLED_FORM).success).toBe(true);

    const { paymentMode: _dropped, ...withoutMode } = FILLED_FORM;
    expect(onboardRiderSchema.safeParse(withoutMode).success).toBe(false);
  });

  it('rejects a mode a payment could never be recorded in', () => {
    expect(onboardRiderSchema.safeParse({ ...FILLED_FORM, paymentMode: 'CHEQUE' }).success).toBe(false);
  });

  it('opens the form on a mode the counter can record', () => {
    expect(MODES).toContain(ONBOARD_RIDER_DEFAULTS.paymentMode);
  });

  it('survives onboarding onto the created rider record', async () => {
    const body: OnboardRiderRequest = {
      aadhaarNumber: '123456789012',
      name: 'Test Rider',
      permanentAddress: 'Somewhere in Bengaluru',
      // A number no fixture rider holds, or onboarding 409s on the duplicate check.
      phone: '9000000001',
      whatsappNumber: '9000000001',
      alternateNumber1: '9000000002',
      localAddress: 'HSR Layout',
      city: 'Bengaluru',
      state: 'Karnataka',
      pinCode: '560102',
      locationCoordinates: null,
      panNumber: null,
      drivingLicence: null,
      workingPlatform: 'Zomato',
      platformRiderId: null,
      planAmount: 175_000,
      billingDay: 'MONDAY',
      paymentDay: 'MONDAY',
      paymentMode: 'BANK_TRANSFER',
      depositPlan: 300_000,
      depositPaid: 300_000,
      onboardedOn: '2026-09-12',
      verification: {
        aadhaarVerified: true,
        primaryVerified: true,
        whatsappVerified: true,
        alternate1Verified: true,
      },
      vehicleId: null,
    };

    const created = await onboardRider(body);
    expect(created.paymentMode).toBe('BANK_TRANSFER');
  });
});
