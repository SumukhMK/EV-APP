import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { HelpMenu } from './HelpMenu';
import { TourContext, type TourValue } from './tourContext';

function renderMenu(overrides: Partial<TourValue> = {}) {
  const value: TourValue = {
    active: null,
    muted: false,
    hasPageTour: true,
    next: vi.fn(),
    back: vi.fn(),
    skip: vi.fn(),
    mute: vi.fn(),
    unmute: vi.fn(),
    replayPlatform: vi.fn(),
    replayPage: vi.fn(),
    ...overrides,
  };
  render(
    <TourContext.Provider value={value}>
      <HelpMenu />
    </TourContext.Provider>,
  );
  return value;
}

/**
 * The permanent way back in. Everything the tour does can be dismissed, so this
 * button is what keeps dismissing it a safe thing to do.
 */
describe('HelpMenu', () => {
  it('is reachable as a labelled button, not a bare glyph', () => {
    renderMenu();

    expect(screen.getByRole('button', { name: /help/i })).toBeInTheDocument();
  });

  it('replays the platform tour', async () => {
    const value = renderMenu();

    await userEvent.click(screen.getByRole('button', { name: /help/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Take the tour' }));

    expect(value.replayPlatform).toHaveBeenCalledOnce();
  });

  it('replays the current screen', async () => {
    const value = renderMenu();

    await userEvent.click(screen.getByRole('button', { name: /help/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'About this screen' }));

    expect(value.replayPage).toHaveBeenCalledOnce();
  });

  it('does not offer a screen tour where there is none to give', async () => {
    renderMenu({ hasPageTour: false });

    await userEvent.click(screen.getByRole('button', { name: /help/i }));

    expect(screen.queryByRole('menuitem', { name: 'About this screen' })).not.toBeInTheDocument();
  });

  it('offers to stop showing tips', async () => {
    const value = renderMenu();

    await userEvent.click(screen.getByRole('button', { name: /help/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Stop showing tips' }));

    expect(value.mute).toHaveBeenCalledOnce();
  });

  it('offers the way back for someone who stopped them', async () => {
    const value = renderMenu({ muted: true });

    await userEvent.click(screen.getByRole('button', { name: /help/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Show tips again' }));

    expect(value.unmute).toHaveBeenCalledOnce();
  });

  it('closes after a choice, rather than sitting open over the tour it started', async () => {
    renderMenu();

    await userEvent.click(screen.getByRole('button', { name: /help/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Take the tour' }));

    expect(screen.queryByRole('menuitem', { name: 'Take the tour' })).not.toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <TourContext.Provider
        value={{
          active: null,
          muted: false,
          hasPageTour: true,
          next: vi.fn(),
          back: vi.fn(),
          skip: vi.fn(),
          mute: vi.fn(),
          unmute: vi.fn(),
          replayPlatform: vi.fn(),
          replayPage: vi.fn(),
        }}
      >
        <HelpMenu />
      </TourContext.Provider>,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
