import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { recordPayment } from '../../lib/api/payments';
import { RecordPaymentDialog } from './RecordPaymentDialog';

vi.mock('../../lib/api/payments', () => ({ recordPayment: vi.fn().mockResolvedValue({}) }));

function show() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RecordPaymentDialog
        target={{ riderId: 'R01', riderName: 'Rider 01', totalDue: 100000, amountPaid: 0 }}
        onClose={() => {}}
      />
    </QueryClientProvider>,
  );
}

describe('RecordPaymentDialog', () => {
  it('keeps the button enabled and refuses an empty or too-large amount', async () => {
    const user = userEvent.setup();
    show();
    const amount = screen.getByLabelText('Amount collected');

    await user.clear(amount);
    await user.click(screen.getByRole('button', { name: 'Record payment' }));
    expect(screen.getByText('Enter an amount above zero.')).toBeInTheDocument();

    await user.type(amount, '5000');
    expect(screen.getByText('More than the balance — record a smaller amount.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Record payment' }));
    expect(recordPayment).not.toHaveBeenCalled();
  });

  it('records a valid amount in one click, with no second confirmation', async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole('button', { name: 'Record 1,000' }));
    expect(recordPayment).toHaveBeenCalledWith({ riderId: 'R01', amount: 100000, method: 'UPI' });
  });
});
