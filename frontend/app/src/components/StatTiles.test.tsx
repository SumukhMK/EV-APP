import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { StatTiles, type StatTile } from './StatTiles';

const makeTiles = (count: number): StatTile[] =>
  Array.from({ length: count }, (_, index) => ({ label: `Tile ${index + 1}`, value: `${index + 1}` }));

describe('StatTiles', () => {
  it.each([6, 8])('renders all %i role-visible tiles', (count) => {
    render(<MemoryRouter><StatTiles tiles={makeTiles(count)} /></MemoryRouter>);

    for (let index = 1; index <= count; index++) {
      expect(screen.getByText(`Tile ${index}`)).toBeInTheDocument();
    }
  });
});
