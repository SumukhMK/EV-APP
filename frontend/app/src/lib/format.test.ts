import { describe, expect, it } from 'vitest';
import { rupees, rupeesWithSymbol, formatNumber } from './format';

/**
 * Rupees at the desk, paise on the wire. The conversion happens once and it
 * happens here, so a fence-post in this file is a fence-post in every figure
 * the app has ever shown.
 */
describe('paise → rupees', () => {
  it('divides by a hundred', () => {
    expect(rupees(100)).toBe('1');
    expect(rupees(125_000)).toBe('1,250');
  });

  it('rounds to the whole rupee rather than truncating', () => {
    expect(rupees(149)).toBe('1');
    expect(rupees(150)).toBe('2');
    expect(rupees(199)).toBe('2');
  });

  it('groups in the Indian system, not the Western one', () => {
    // 12,34,567 — lakh grouping. Western grouping would give 1,234,567.
    expect(rupees(123_456_700)).toBe('12,34,567');
    expect(formatNumber(1_00_00_000)).toBe('1,00,00,000');
  });

  it('handles zero without a sign or a gap', () => {
    expect(rupees(0)).toBe('0');
    expect(rupeesWithSymbol(0)).toBe('₹0');
  });

  it('prefixes the symbol with no space', () => {
    expect(rupeesWithSymbol(500_00)).toBe('₹500');
  });

  it('keeps a refund negative', () => {
    expect(rupeesWithSymbol(-250_00)).toBe('₹-250');
  });
});
