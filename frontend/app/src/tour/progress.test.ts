import { beforeEach, describe, expect, it, vi } from 'vitest';
import { markPageSeen, markPlatformSeen, readProgress, setMuted, STORAGE_KEY } from './progress';

/**
 * What the tour remembers between sessions. Everything here is about the
 * promise that a tour shown once is not shown again — and the matching promise
 * that a private window which refuses storage still gets a working app.
 */
describe('tour progress', () => {
  beforeEach(() => localStorage.clear());

  it('reports nothing seen for a user who has never signed in', () => {
    const progress = readProgress('meenakshi@g1mobility.in');

    expect(progress.platformSeen).toBe(false);
    expect(progress.pagesSeen).toEqual([]);
    expect(progress.muted).toBe(false);
  });

  it('remembers the platform tour was seen', () => {
    markPlatformSeen('meenakshi@g1mobility.in');

    expect(readProgress('meenakshi@g1mobility.in').platformSeen).toBe(true);
  });

  it('keeps one user’s progress out of another’s', () => {
    markPlatformSeen('meenakshi@g1mobility.in');

    expect(readProgress('dhananjay@g1mobility.in').platformSeen).toBe(false);
  });

  it('remembers each page tour separately', () => {
    markPageSeen('meenakshi@g1mobility.in', '/vehicles');

    const progress = readProgress('meenakshi@g1mobility.in');
    expect(progress.pagesSeen).toContain('/vehicles');
    expect(progress.pagesSeen).not.toContain('/riders');
  });

  it('remembers that the user asked to stop being shown things', () => {
    setMuted('meenakshi@g1mobility.in', true);

    expect(readProgress('meenakshi@g1mobility.in').muted).toBe(true);
  });

  it('treats a stored record from an older tour version as nothing seen', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ 'meenakshi@g1mobility.in': { version: 0, platformSeen: true, pagesSeen: ['/vehicles'] } }),
    );

    const progress = readProgress('meenakshi@g1mobility.in');
    expect(progress.platformSeen).toBe(false);
    expect(progress.pagesSeen).toEqual([]);
  });

  it('survives a storage that refuses to be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('private window');
    });

    expect(() => readProgress('meenakshi@g1mobility.in')).not.toThrow();
    expect(readProgress('meenakshi@g1mobility.in').platformSeen).toBe(false);
  });

  it('survives a storage that refuses to be written', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    expect(() => markPlatformSeen('meenakshi@g1mobility.in')).not.toThrow();
  });

  it('treats a corrupt record as nothing seen rather than throwing', () => {
    localStorage.setItem(STORAGE_KEY, 'not json');

    expect(readProgress('meenakshi@g1mobility.in').platformSeen).toBe(false);
  });
});
