import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Flows } from './Flows';

describe('flows reference page', () => {
  it('draws the service and money journeys and links to the real screens', () => {
    render(<MemoryRouter><Flows /></MemoryRouter>);
    expect(screen.getByText('How the work flows')).toBeInTheDocument();
    expect(screen.getByText('QC')).toBeInTheDocument();
    expect(screen.getByText('Repair charges column').closest('a')).toHaveAttribute('href', '/payments/run');
  });
});
