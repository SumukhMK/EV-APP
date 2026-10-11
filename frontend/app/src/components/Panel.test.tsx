import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Panel } from './Panel';
import { InfoTip } from './InfoTip';
import { panelAnchor } from '../tour/anchors';

/**
 * A card is a tour target, keyed by the label it already shows.
 *
 * The subtlety is that a label is a `ReactNode`, and ten panels now title
 * themselves `<>Money <InfoTip …/></>` so an info tip can sit beside the words.
 * Keying only off plain strings quietly dropped every one of those from its
 * screen's tour — the assign, exchange and deboard flows lost every card they
 * had. The words are still right there in the label; they just need reading out
 * of it.
 */
describe('Panel as a tour target', () => {
  const anchorOf = (container: HTMLElement) =>
    container.querySelector('[data-tour]')?.getAttribute('data-tour') ?? null;

  it('is a target, keyed by its plain-text label', () => {
    const { container } = render(<Panel label="Verification">body</Panel>);

    expect(anchorOf(container)).toBe(panelAnchor('Verification'));
  });

  it('reads the words out of a label that carries an info tip beside them', () => {
    const { container } = render(
      <Panel
        label={
          <>
            Summary <InfoTip title="What the register will hold." />
          </>
        }
      >
        body
      </Panel>,
    );

    expect(anchorOf(container)).toBe(panelAnchor('Summary'));
  });

  it('keeps a multi-word label whole', () => {
    const { container } = render(
      <Panel
        label={
          <>
            Why is the bike coming back? <InfoTip title="The reason it is ending." />
          </>
        }
      >
        body
      </Panel>,
    );

    expect(anchorOf(container)).toBe(panelAnchor('Why is the bike coming back?'));
  });

  it('is not a target when there is no label to key off', () => {
    const { container } = render(<Panel>body</Panel>);

    expect(anchorOf(container)).toBeNull();
  });

  it('is not a target when the label has no words of its own', () => {
    const { container } = render(<Panel label={<InfoTip title="Only a tip." />}>body</Panel>);

    expect(anchorOf(container)).toBeNull();
  });

  /** A collapsed card is still on screen, and pointing at one worth opening is useful. */
  it('stays a target when it is collapsed', () => {
    const { container } = render(
      <Panel label="Lifecycle" collapsible defaultOpen={false}>
        body
      </Panel>,
    );

    expect(anchorOf(container)).toBe(panelAnchor('Lifecycle'));
  });
});
