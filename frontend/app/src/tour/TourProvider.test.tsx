import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter } from 'react-router-dom';
import { SessionContext, type SessionValue } from '../app/sessionContext';
import type { UserRole } from '../types';
import { TourProvider } from './TourProvider';
import { useTour } from './tourContext';
import { markPageSeen, markPlatformSeen, readProgress, setMuted } from './progress';

const EMAIL = 'meenakshi@g1mobility.in';

/**
 * A window onto the machine. The tour's UI is deliberately not involved — the
 * provider's whole job is deciding *what* should be showing and *when*, and
 * that decision is worth testing without a Popper in the way.
 */
function Probe() {
  const tour = useTour();
  if (!tour.active) return <div>idle</div>;
  return (
    <div>
      <span>
        {tour.active.kind} {tour.active.index + 1} of {tour.active.steps.length}
      </span>
      <span data-testid="step-id">{tour.active.steps[tour.active.index].id}</span>
      <button onClick={tour.next}>next</button>
      <button onClick={tour.back}>back</button>
      <button onClick={tour.skip}>skip</button>
      <button onClick={tour.mute}>mute</button>
    </div>
  );
}

/**
 * The `?` menu's view of the same machine: what it may offer, and what the
 * offers do. Kept apart from `Probe` because these must work while a tour is
 * idle, which is exactly when `Probe` renders nothing.
 */
function Menu() {
  const tour = useTour();
  return (
    <div>
      <span data-testid="menu">
        {tour.muted ? 'muted' : 'not muted'} · {tour.hasPageTour ? 'has page tour' : 'no page tour'}
      </span>
      <button onClick={tour.replayPlatform}>replay platform</button>
      <button onClick={tour.replayPage}>replay page</button>
      <button onClick={tour.unmute}>unmute</button>
      <Link to="/vehicles">go to vehicles</Link>
      <Link to="/qc">go to nowhere</Link>
    </div>
  );
}

function renderTour(path = '/dashboard', role: UserRole = 'FLEET_ADMIN') {
  const session: SessionValue = {
    user: { name: 'Meenakshi Iyer', roleKey: role, email: EMAIL },
    tenant: 'G1 Mobility Rentals',
    personas: [],
    signedIn: true,
    restoring: false,
    signIn: vi.fn(),
    signOut: vi.fn(),
    switchPersona: vi.fn(),
  };
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SessionContext.Provider value={session}>
        <TourProvider>
          <Probe />
          <Menu />
        </TourProvider>
      </SessionContext.Provider>
    </MemoryRouter>,
  );
}

describe('TourProvider', () => {
  beforeEach(() => localStorage.clear());

  describe('first run', () => {
    it('starts the platform tour for someone who has never seen it', () => {
      renderTour();

      expect(screen.getByTestId('step-id')).toHaveTextContent('welcome');
    });

    it('stays out of the way once the platform tour has been seen', () => {
      markPlatformSeen(EMAIL);

      renderTour('/qc');

      expect(screen.getByText('idle')).toBeInTheDocument();
    });

    it('stays out of the way for someone who asked not to be shown things', () => {
      setMuted(EMAIL, true);

      renderTour('/qc');

      expect(screen.getByText('idle')).toBeInTheDocument();
    });
  });

  describe('role filtering', () => {
    it('counts only the steps a service manager will actually reach', () => {
      renderTour('/dashboard', 'SERVICE_MANAGER');

      // welcome, rail, Operations, Fleet, Service management, help — no
      // Riders, Money or Admin.
      expect(screen.getByText('platform 1 of 6')).toBeInTheDocument();
    });

    it('counts every section for a super admin', () => {
      renderTour('/dashboard', 'SUPER_ADMIN');

      expect(screen.getByText('platform 1 of 9')).toBeInTheDocument();
    });
  });

  describe('moving through a tour', () => {
    it('advances a step at a time', async () => {
      renderTour();
      await userEvent.click(screen.getByText('next'));

      expect(screen.getByTestId('step-id')).toHaveTextContent('rail');
    });

    it('goes back', async () => {
      renderTour();
      await userEvent.click(screen.getByText('next'));
      await userEvent.click(screen.getByText('back'));

      expect(screen.getByTestId('step-id')).toHaveTextContent('welcome');
    });

    it('will not go back past the first step', async () => {
      renderTour();
      await userEvent.click(screen.getByText('back'));

      expect(screen.getByTestId('step-id')).toHaveTextContent('welcome');
    });

    it('ends after the last step, and remembers it was seen', async () => {
      renderTour('/qc', 'SERVICE_MANAGER');
      for (let i = 0; i < 6; i++) await userEvent.click(screen.getByText('next'));

      expect(screen.getByText('idle')).toBeInTheDocument();
      expect(readProgress(EMAIL).platformSeen).toBe(true);
    });

    it('skipping counts as seen, so it does not reappear next login', async () => {
      renderTour('/qc');
      await userEvent.click(screen.getByText('skip'));

      expect(screen.getByText('idle')).toBeInTheDocument();
      expect(readProgress(EMAIL).platformSeen).toBe(true);
    });

    it('muting stops the tour and everything after it', async () => {
      renderTour('/qc');
      await userEvent.click(screen.getByText('mute'));

      expect(screen.getByText('idle')).toBeInTheDocument();
      expect(readProgress(EMAIL).muted).toBe(true);
    });
  });

  describe('page tours', () => {
    it('runs a screen’s own tour once the platform tour is behind you', () => {
      markPlatformSeen(EMAIL);

      renderTour('/vehicles');

      expect(screen.getByTestId('step-id')).toHaveTextContent('vehicles:what');
    });

    it('never interrupts the platform tour with a page tour', () => {
      renderTour('/vehicles');

      expect(screen.getByTestId('step-id')).toHaveTextContent('welcome');
    });

    it('does not run the same screen’s tour twice', async () => {
      markPlatformSeen(EMAIL);
      const { unmount } = renderTour('/vehicles');
      await userEvent.click(screen.getByText('skip'));
      unmount();

      renderTour('/vehicles');

      expect(screen.getByText('idle')).toBeInTheDocument();
    });

    it('shows nothing on a legacy path that only redirects', () => {
      markPlatformSeen(EMAIL);

      renderTour('/qc');

      expect(screen.getByText('idle')).toBeInTheDocument();
    });

    /**
     * Walking away mid-tour is a perfectly normal thing to do, and the tour has
     * to notice. Left alone, the dashboard's words stayed on screen while the
     * user stood on the vehicles list, pointing at that page's title.
     */
    it('abandons a page tour when the user navigates away from the page', async () => {
      markPlatformSeen(EMAIL);
      renderTour('/dashboard');
      expect(screen.getByTestId('step-id')).toHaveTextContent('dashboard:what');

      await userEvent.click(screen.getByText('go to nowhere'));

      expect(screen.getByText('idle')).toBeInTheDocument();
    });

    it('starts the new screen’s tour when navigating straight from another one', async () => {
      markPlatformSeen(EMAIL);
      renderTour('/dashboard');

      await userEvent.click(screen.getByText('go to vehicles'));

      expect(screen.getByTestId('step-id')).toHaveTextContent('vehicles:what');
    });

    it('counts an abandoned page tour as seen, rather than nagging on every visit', async () => {
      markPlatformSeen(EMAIL);
      renderTour('/dashboard');

      await userEvent.click(screen.getByText('go to nowhere'));

      expect(readProgress(EMAIL).pagesSeen).toContain('/dashboard');
    });

    /**
     * The rail is on every screen, so the platform tour is the one thing that
     * has no business being cancelled by a navigation — a user who clicks a nav
     * item while being shown the rail should keep being shown the rail.
     */
    it('does not abandon the platform tour when the user navigates', async () => {
      renderTour('/dashboard');
      await userEvent.click(screen.getByText('next'));

      await userEvent.click(screen.getByText('go to vehicles'));

      expect(screen.getByTestId('step-id')).toHaveTextContent('rail');
    });
  });

  /**
   * A tour the user can lose by pressing Escape and never get back is a trap.
   * Everything the `?` menu offers has to work from a standing start, including
   * after the user has muted — otherwise muting is a one-way door.
   */
  describe('replaying from the ? menu', () => {
    it('replays the platform tour even though it has been seen', async () => {
      markPlatformSeen(EMAIL);
      renderTour('/qc');

      await userEvent.click(screen.getByText('replay platform'));

      expect(screen.getByTestId('step-id')).toHaveTextContent('welcome');
    });

    it('replays a screen’s tour even though it has been seen', async () => {
      markPlatformSeen(EMAIL);
      markPageSeen(EMAIL, '/vehicles');
      renderTour('/vehicles');
      expect(screen.getByText('idle')).toBeInTheDocument();

      await userEvent.click(screen.getByText('replay page'));

      expect(screen.getByTestId('step-id')).toHaveTextContent('vehicles:what');
    });

    it('replays on request even for someone who muted, so muting is not a one-way door', async () => {
      setMuted(EMAIL, true);
      renderTour('/qc');

      await userEvent.click(screen.getByText('replay platform'));

      expect(screen.getByTestId('step-id')).toHaveTextContent('welcome');
    });

    it('does nothing when asked to replay a path that has no tour', async () => {
      markPlatformSeen(EMAIL);
      renderTour('/qc');

      await userEvent.click(screen.getByText('replay page'));

      expect(screen.getByText('idle')).toBeInTheDocument();
    });

    it('tells the menu whether this screen has a tour to offer', () => {
      markPlatformSeen(EMAIL);

      renderTour('/vehicles');

      expect(screen.getByTestId('menu')).toHaveTextContent('has page tour');
    });

    it('tells the menu when this screen has no tour to offer', () => {
      markPlatformSeen(EMAIL);

      renderTour('/qc');

      expect(screen.getByTestId('menu')).toHaveTextContent('no page tour');
    });

    it('tells the menu the user is muted, so it can offer to unmute', async () => {
      renderTour('/qc');

      await userEvent.click(screen.getByText('mute'));

      expect(screen.getByTestId('menu')).toHaveTextContent('muted');
    });

    it('unmutes, and the choice sticks', async () => {
      setMuted(EMAIL, true);
      renderTour('/qc');

      await userEvent.click(screen.getByText('unmute'));

      expect(screen.getByTestId('menu')).toHaveTextContent('not muted');
      expect(readProgress(EMAIL).muted).toBe(false);
    });

    it('unmuting does not replay a tour the user has already seen', async () => {
      markPlatformSeen(EMAIL);
      markPageSeen(EMAIL, '/vehicles');
      setMuted(EMAIL, true);
      renderTour('/vehicles');

      await userEvent.click(screen.getByText('unmute'));

      expect(screen.getByText('idle')).toBeInTheDocument();
    });
  });
});
