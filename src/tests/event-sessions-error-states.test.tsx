/**
 * P124: EventSessions Error States Test
 * Visual test demonstrating error handling UI
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { EventSessions } from '@/app/prototypes/events/components/EventSessions';

describe('EventSessions Error States', () => {
  const mockRetry = vi.fn();
  const defaultProps = {
    subRooms: [],
    loading: false,
    error: null,
    onRetry: mockRetry,
    currentUserId: 'user-1',
    eventSlug: 'test-event',
  };

  it('displays error message and retry button when error prop is set', () => {
    render(
      <BrowserRouter>
        <EventSessions {...defaultProps} error="Failed to load sessions. Please try again." />
      </BrowserRouter>
    );

    expect(screen.getByText('Failed to load sessions. Please try again.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('calls onRetry when retry button is clicked', () => {
    render(
      <BrowserRouter>
        <EventSessions {...defaultProps} error="Failed to load sessions. Please try again." />
      </BrowserRouter>
    );

    const retryButton = screen.getByRole('button', { name: 'Retry' });
    fireEvent.click(retryButton);

    expect(mockRetry).toHaveBeenCalledTimes(1);
  });

  it('does not show error UI when error is null', () => {
    render(
      <BrowserRouter>
        <EventSessions {...defaultProps} />
      </BrowserRouter>
    );

    expect(screen.queryByText(/Failed to load/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('prioritizes error display over loading state', () => {
    render(
      <BrowserRouter>
        <EventSessions {...defaultProps} loading={true} error="Network error" />
      </BrowserRouter>
    );

    // Loading is true but error takes priority
    expect(screen.queryByText('Loading sessions...')).not.toBeInTheDocument();
    expect(screen.getByText('Network error')).toBeInTheDocument();
  });
});
