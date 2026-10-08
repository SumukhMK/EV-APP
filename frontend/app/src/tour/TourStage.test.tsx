import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { TourContext, type TourValue } from './tourContext';
import { TourStage } from './TourStage';
import type { TourStep } from './steps/platform';

const STEPS: TourStep[] = [
  { id: 'welcome', anchor: null, title: 'FleeTech runs your fleet.', body: 'The bikes, the riders, and the money.' },
  { id: 'rail', anchor: 'rail', title: 'Everything is here', body: 'Six groups, top to bottom.' },
  { id: 'help', anchor: 'help', title: 'Lost?', body: 'Replay this anytime.' },
];

function renderStage(overrides: Partial<TourValue> = {}, index = 0) {
  const value: TourValue = {
    active: { kind: 'platform', steps: STEPS, index },
    muted: false,
    hasPageTour: false,
    next: vi.fn(),
    back: vi.fn(),
    skip: vi.fn(),
    mute: vi.fn(),
    unmute: vi.fn(),
    replayPlatform: vi.fn(),
    replayPage: vi.fn(),
    ...overrides,
  };
  const result = render(
    <TourContext.Provider value={value}>
      <TourStage />
    </TourContext.Provider>,
  );
  return { ...result, value };
}

function mountAnchor(name: string) {
  const el = document.createElement('div');
  el.setAttribute('data-tour', name);
  document.body.appendChild(el);
  return el;
}

describe('TourStage', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('draws nothing at all when no tour is running', () => {
    const { container } = renderStage({ active: null });

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the step’s words', () => {
    renderStage();

    expect(screen.getByText('FleeTech runs your fleet.')).toBeInTheDocument();
    expect(screen.getByText('The bikes, the riders, and the money.')).toBeInTheDocument();
  });

  it('says where you are, so the tour never feels open-ended', () => {
    mountAnchor('rail');

    renderStage({}, 1);

    expect(screen.getByText('2 of 3')).toBeInTheDocument();
  });

  it('is announced as a dialog with the step as its name', () => {
    renderStage();

    expect(screen.getByRole('dialog', { name: /FleeTech runs your fleet/ })).toBeInTheDocument();
  });

  it('advances on Next', async () => {
    const next = vi.fn();
    renderStage({ next });

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(next).toHaveBeenCalledOnce();
  });

  it('offers no Back on the first step', () => {
    renderStage({}, 0);

    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
  });

  it('offers Back once there is somewhere to go back to', async () => {
    const back = vi.fn();
    mountAnchor('rail');
    renderStage({ back }, 1);

    await userEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(back).toHaveBeenCalledOnce();
  });

  it('ends with Done rather than Next, so the last step reads as the last', () => {
    mountAnchor('help');
    renderStage({}, 2);

    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
  });

  it('leaves on Escape', async () => {
    const skip = vi.fn();
    renderStage({ skip });

    await userEvent.keyboard('{Escape}');

    expect(skip).toHaveBeenCalledOnce();
  });

  it('skips a step whose target never arrives, rather than pointing at nothing', async () => {
    const next = vi.fn();
    renderStage({ next }, 1); // 'rail', never mounted

    await waitFor(() => expect(next).toHaveBeenCalledOnce(), { timeout: 3000 });
  });

  /**
   * On a phone the rail is a closed drawer, so every one of its steps resolves
   * to nothing. Skipping them left the platform tour as a single welcome card.
   * A step that asks for it falls back to a centred card instead, and still
   * says its piece.
   */
  it('shows a card instead of skipping, for a step that says its words stand alone', async () => {
    const next = vi.fn();
    const steps: TourStep[] = [
      { id: 'money', anchor: 'nav:Money', onMissing: 'card', title: 'Money', body: 'Weekly collections.' },
    ];
    render(
      <TourContext.Provider
        value={{
          active: { kind: 'platform', steps, index: 0 },
          muted: false,
          hasPageTour: false,
          next,
          back: vi.fn(),
          skip: vi.fn(),
          mute: vi.fn(),
          unmute: vi.fn(),
          replayPlatform: vi.fn(),
          replayPage: vi.fn(),
        }}
      >
        <TourStage />
      </TourContext.Provider>,
    );

    await waitFor(() => expect(screen.getByText('Weekly collections.')).toBeInTheDocument(), { timeout: 3000 });
    expect(next).not.toHaveBeenCalled();
  });

  /**
   * On a phone every rail step is stranded, and each one sat on a blank screen
   * for the full give-up period before its card appeared — nine steps of that
   * is a tour that looks broken. A step with a card to fall back on does not
   * need the patience a step that would be *dropped* deserves: the long wait
   * exists so a late chunk is not skipped by mistake, and nothing is being
   * skipped here.
   */
  it('falls back to its card quickly, instead of sitting blank for the full wait', async () => {
    const steps: TourStep[] = [
      { id: 'money', anchor: 'nav:Money', onMissing: 'card', title: 'Money', body: 'Weekly collections.' },
    ];
    render(
      <TourContext.Provider
        value={{
          active: { kind: 'platform', steps, index: 0 },
          muted: false,
          hasPageTour: false,
          next: vi.fn(),
          back: vi.fn(),
          skip: vi.fn(),
          mute: vi.fn(),
          unmute: vi.fn(),
          replayPlatform: vi.fn(),
          replayPage: vi.fn(),
        }}
      >
        <TourStage />
      </TourContext.Provider>,
    );

    await waitFor(() => expect(screen.getByText('Weekly collections.')).toBeInTheDocument(), { timeout: 700 });
  });

  it('waits quietly for a target instead of flashing an unplaced bubble', () => {
    renderStage({}, 1); // 'rail', not mounted yet

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderStage();

    expect(await axe(container)).toHaveNoViolations();
  });
});
