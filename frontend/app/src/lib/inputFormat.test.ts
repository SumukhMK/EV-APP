import { describe, expect, it } from 'vitest';
import { digitsOnly, rupeesInput } from './inputFormat';

describe('digitsOnly', () => {
  it('drops everything but digits and caps the length', () => {
    expect(digitsOnly('98a-76 5.4e3', 6)).toBe('987654');
  });
});

describe('rupeesInput', () => {
  it('takes whole rupees only: no point, no paise', () => {
    expect(rupeesInput('1,750.50')).toBe('1750');
    expect(rupeesInput('-5e')).toBe('5');
    expect(rupeesInput('abc')).toBe('');
    expect(rupeesInput('99.75')).toBe('99');
  });
  it('can still allow decimals if a field ever needs them', () => {
    expect(rupeesInput('1,750.509', { decimals: 2 })).toBe('1750.50');
  });
  it('caps the whole part', () => {
    expect(rupeesInput('123456789', { maxDigits: 7 })).toBe('1234567');
  });
});
