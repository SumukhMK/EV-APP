import { describe, expect, it, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Flows } from './Flows';

// ReactFlow uses ResizeObserver internally; jsdom does not provide it.
// Must be a real class (new ResizeObserver(...)), not an arrow function.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
});

describe('interactive flows page', () => {
  it('renders the page header and mode tabs', () => {
    render(<MemoryRouter><Flows /></MemoryRouter>);
    expect(screen.getByText('How the work flows')).toBeInTheDocument();
    expect(screen.getByText('How it works')).toBeInTheDocument();
    expect(screen.getByText('What we store')).toBeInTheDocument();
    expect(screen.getByText('Who can do what')).toBeInTheDocument();
    expect(screen.getByText('What changes')).toBeInTheDocument();
    expect(screen.getByText('Where money flows')).toBeInTheDocument();
  });

  it('shows the legend', () => {
    render(<MemoryRouter><Flows /></MemoryRouter>);
    expect(screen.getByText('Legend:')).toBeInTheDocument();
  });
});
