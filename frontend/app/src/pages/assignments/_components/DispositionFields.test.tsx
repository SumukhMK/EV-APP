import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { DispositionFields } from './DispositionFields';
import { DamageItemsField } from './DamageItemsField';
import type { ReturnCondition, VehicleState } from '../../../types';

function ReturnForm({ condition }: { condition: ReturnCondition }) {
  const form = useForm<{ reason: string; date: string; next: VehicleState }>({ defaultValues: { reason: 'RETURNED', date: '2026-09-18', next: 'QC_PENDING' } });
  const next = useWatch({ control: form.control, name: 'next' });
  return <FormProvider {...form}>
    <DispositionFields control={form.control} reasonName="reason" reasonLabel="Reason" reasonOptions={[{ value: 'RETURNED', label: 'Returned' }]} dateName="date" dateLabel="Date" nextStateName="next" condition={condition} />
    <output aria-label="Selected state">{next}</output>
  </FormProvider>;
}

function DamageDraft() {
  const form = useForm({ defaultValues: { damageItems: [{ part: '', note: '' }] } });
  return <FormProvider {...form}><DamageItemsField noDamage /></FormProvider>;
}

describe('return destinations', () => {
  it.each(['NONE', 'MINOR', 'MAJOR', 'ACCIDENT'] as const)('shows all three operational destinations for %s', async (condition) => {
    const user = userEvent.setup();
    render(<ReturnForm condition={condition} />);
    await user.click(screen.getByRole('combobox', { name: 'Where does the bike go next?' }));
    for (const label of ['Quality Check', 'In Service', 'Accident']) {
      expect(screen.getByRole('option', { name: label })).toBeInTheDocument();
    }
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it.each([
    ['NONE', 'QC_PENDING'], ['MINOR', 'UNDER_REPAIR'], ['MAJOR', 'UNDER_REPAIR'], ['ACCIDENT', 'ACCIDENT'],
  ] as const)('defaults %s to %s rather than an arbitrary DEPLOYED transition', (condition, expected) => {
    render(<ReturnForm condition={condition} />);
    expect(screen.getByRole('status')).toHaveTextContent(expected);
  });

  it('preserves a deliberate destination override when severity changes', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ReturnForm condition="NONE" />);
    // Default for NONE is QC_PENDING. Override to In Service.
    await user.click(screen.getByRole('combobox', { name: 'Where does the bike go next?' }));
    await user.click(screen.getByRole('option', { name: 'In Service' }));
    rerender(<ReturnForm condition="ACCIDENT" />);
    expect(screen.getByRole('status')).toHaveTextContent('UNDER_REPAIR');
  });

  it('lets an operator clear unfinished damage rows after selecting no damage', async () => {
    const user = userEvent.setup();
    render(<DamageDraft />);
    expect(screen.getByRole('textbox', { name: 'Part / area' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear damage details' }));
    expect(screen.queryByRole('textbox', { name: 'Part / area' })).not.toBeInTheDocument();
  });
});
