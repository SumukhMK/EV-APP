import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormProvider, useForm } from 'react-hook-form';
import { ONBOARD_RIDER_DEFAULTS, type OnboardRiderValues } from '../../../lib/schemas/rider';
import { RiderCommercialStep } from './RiderCommercialStep';

/**
 * The platform box is a freeSolo combobox: the list is a suggestion and a
 * typed name is a value. It was not — the field started as "Other", a typed
 * platform was appended to it, and a rider was saved on the platform
 * "OtherZomato". Typing alone, with no Enter and no option picked, has to
 * land in the form.
 */
function Harness({ onValues }: { onValues: (v: OnboardRiderValues) => void }) {
  const form = useForm<OnboardRiderValues>({ defaultValues: ONBOARD_RIDER_DEFAULTS });
  return (
    <FormProvider {...form}>
      <RiderCommercialStep step={4} />
      <button type="button" onClick={() => onValues(form.getValues())}>read</button>
    </FormProvider>
  );
}

describe('working platform', () => {
  it('starts empty rather than pre-filled with "Other"', () => {
    render(<Harness onValues={() => {}} />);
    expect(screen.getByRole('combobox', { name: 'Working platform' })).toHaveValue('');
  });

  it('keeps a platform that was typed and never picked from the list', async () => {
    let values: OnboardRiderValues | null = null;
    render(<Harness onValues={(v) => { values = v; }} />);
    const user = userEvent.setup();

    await user.type(screen.getByRole('combobox', { name: 'Working platform' }), 'Zepto Now');
    await user.tab();
    await user.click(screen.getByRole('button', { name: 'read' }));

    expect(values!.workingPlatform).toBe('Zepto Now');
  });

  it('keeps a platform picked from the list', async () => {
    let values: OnboardRiderValues | null = null;
    render(<Harness onValues={(v) => { values = v; }} />);
    const user = userEvent.setup();

    await user.type(screen.getByRole('combobox', { name: 'Working platform' }), 'Zom');
    await user.click(await screen.findByRole('option', { name: 'Zomato' }));
    await user.click(screen.getByRole('button', { name: 'read' }));

    expect(values!.workingPlatform).toBe('Zomato');
  });
});
