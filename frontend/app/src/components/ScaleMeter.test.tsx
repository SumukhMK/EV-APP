import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { ScaleMeter } from './ScaleMeter';
import { bandFor } from '../theme/tokens';

/**
 * The bar, the figure and the pill are three renderings of one number. The
 * component derives all three from `bandFor`, so the point of these tests is
 * that nothing can reintroduce a second source of truth.
 */
describe('ScaleMeter', () => {
  it.each([
    [92, 'High'],
    [70, 'Mid'],
    [40, 'Low'],
    [12, 'Risk'],
  ])('renders %i%% as the %s band', (percent, label) => {
    render(<ScaleMeter label="Whitefield" percent={percent} />);
    expect(screen.getByText(`${percent}%`)).toBeInTheDocument();
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('never lets the pill disagree with the figure', () => {
    for (let p = 0; p <= 100; p += 1) {
      const { unmount } = render(<ScaleMeter label="Hub" percent={p} />);
      const expected = { high: 'High', mid: 'Mid', low: 'Low', risk: 'Risk' }[bandFor(p)];
      expect(screen.getByText(expected), `${p}%`).toBeInTheDocument();
      unmount();
    }
  });

  it('exposes the value to assistive tech, band and all', () => {
    render(<ScaleMeter label="Whitefield" percent={92} />);
    const meter = screen.getByRole('meter');
    expect(meter).toHaveAttribute('aria-valuenow', '92');
    expect(meter).toHaveAttribute('aria-valuemin', '0');
    expect(meter).toHaveAttribute('aria-valuemax', '100');
    expect(meter).toHaveAccessibleName('Whitefield: 92 percent, High');
  });

  it('hides the pill on request without losing the accessible name', () => {
    render(<ScaleMeter label="Whitefield" percent={92} showBand={false} />);
    expect(screen.queryByText('High')).not.toBeInTheDocument();
    expect(screen.getByRole('meter')).toHaveAccessibleName('Whitefield: 92 percent, High');
  });

  it('renders a caption when given one', () => {
    render(<ScaleMeter label="Whitefield" percent={92} caption="46 of 50 deployed" />);
    expect(screen.getByText('46 of 50 deployed')).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = render(<ScaleMeter label="Whitefield" percent={92} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
