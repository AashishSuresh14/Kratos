import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import { ErrorState } from '../components/States';

const renderIt = (e: unknown) =>
  render(
    <MemoryRouter>
      <ErrorState error={e} />
    </MemoryRouter>,
  );

describe('ErrorState', () => {
  it('shows a calm AI-off state with the API detail on 503', () => {
    renderIt(new ApiError(503, { title: 'AI unavailable', detail: 'No AI provider is configured for this feature.' }));
    expect(screen.getByText('AI is not available right now')).toBeInTheDocument();
    expect(screen.getByText('No AI provider is configured for this feature.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('asks the user to slow down on 429', () => {
    renderIt(new ApiError(429, {}));
    expect(screen.getByText('Slow down a little')).toBeInTheDocument();
  });
  it('shows not found for 404 (also used for out-of-scope accounts)', () => {
    renderIt(new ApiError(404, { detail: 'Account was not found.' }));
    expect(screen.getByText('Not found')).toBeInTheDocument();
  });
});
