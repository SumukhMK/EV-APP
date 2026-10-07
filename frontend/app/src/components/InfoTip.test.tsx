import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InfoTip } from './InfoTip';

describe('InfoTip', () => {
  it('shows the explanation on hover, for pointer devices', async () => {
    const user = userEvent.setup();
    render(<InfoTip title="Hovered explanation" />);
    await user.hover(screen.getByRole('img', { name: /Hovered explanation/ }));
    expect(await screen.findByText('Hovered explanation')).toBeInTheDocument();
  });

  it('opens on tap or click, for touch screens where hover does not exist', async () => {
    const user = userEvent.setup();
    render(<InfoTip title="Tapped explanation" />);
    await user.click(screen.getByRole('img', { name: /Tapped explanation/ }));
    expect(await screen.findByText('Tapped explanation')).toBeInTheDocument();
  });

  it('closes the popover on a tap outside', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <InfoTip title="Closable explanation" />
        <button>Elsewhere</button>
      </div>,
    );
    await user.click(screen.getByRole('img', { name: /Closable explanation/ }));
    expect(await screen.findByText('Closable explanation')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(screen.queryByText('Closable explanation')).not.toBeInTheDocument();
  });

  it('opens with the keyboard and closes on Escape', async () => {
    const user = userEvent.setup();
    render(<InfoTip title="Keyboard explanation" />);
    const icon = screen.getByRole('img', { name: /Keyboard explanation/ });
    icon.focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByText('Keyboard explanation')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByText('Keyboard explanation')).not.toBeInTheDocument();
  });
});