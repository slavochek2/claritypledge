import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateIdeaModal } from './CreateIdeaModal';
import * as mockData from '../data/mock-data';

// Mock the mock-data module
vi.mock('../data/mock-data', async () => {
  const actual = await vi.importActual('../data/mock-data');
  return {
    ...actual,
    createIdea: vi.fn(),
  };
});

describe('CreateIdeaModal - P1 Critical Tests', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onIdeaCreated: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('can open modal', () => {
    render(<CreateIdeaModal {...defaultProps} />);
    expect(screen.getByText('New Idea')).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    render(<CreateIdeaModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByText('New Idea')).not.toBeInTheDocument();
  });

  it('can type idea text', () => {
    render(<CreateIdeaModal {...defaultProps} />);
    const textarea = screen.getByPlaceholderText('Write your idea...');

    fireEvent.change(textarea, { target: { value: 'Remote work is great' } });

    expect(textarea).toHaveValue('Remote work is great');
  });

  it('Post button disabled when empty', () => {
    render(<CreateIdeaModal {...defaultProps} />);
    const postButton = screen.getByRole('button', { name: /Post Idea/i });

    expect(postButton).toBeDisabled();
  });

  it('Post button disabled when > 280 chars', () => {
    render(<CreateIdeaModal {...defaultProps} />);
    const textarea = screen.getByPlaceholderText('Write your idea...');
    const longText = 'a'.repeat(281);

    fireEvent.change(textarea, { target: { value: longText } });

    const postButton = screen.getByRole('button', { name: /Post Idea/i });
    expect(postButton).toBeDisabled();
    expect(screen.getByText('Too long')).toBeInTheDocument();
  });

  it('can select position (Agree/Disagree/Unsure)', () => {
    render(<CreateIdeaModal {...defaultProps} />);

    // Get all buttons (there are 3 position buttons plus close and post)
    const buttons = screen.getAllByRole('button');
    const positionButtons = buttons.filter(btn =>
      btn.textContent?.match(/Agree|Disagree|Unsure/)
    );

    // Find specific position buttons
    const agreeButton = positionButtons.find(btn => btn.textContent === 'Agree')!;
    const disagreeButton = positionButtons.find(btn => btn.textContent === 'Disagree')!;
    const unsureButton = positionButtons.find(btn => btn.textContent === 'Unsure')!;

    // Default should be Agree (has blue border)
    expect(agreeButton).toHaveClass('border-blue-500');

    // Click Disagree
    fireEvent.click(disagreeButton);
    expect(disagreeButton).toHaveClass('border-blue-500');
    expect(agreeButton).not.toHaveClass('border-blue-500');

    // Click Unsure
    fireEvent.click(unsureButton);
    expect(unsureButton).toHaveClass('border-blue-500');
    expect(disagreeButton).not.toHaveClass('border-blue-500');
  });

  it('can post idea (creates in mock data)', async () => {
    const mockIdea = {
      id: 'idea-123',
      text: 'Test idea',
      createdAt: new Date().toISOString(),
      engagements: [],
      comments: [],
    };
    vi.mocked(mockData.createIdea).mockReturnValue(mockIdea);

    render(<CreateIdeaModal {...defaultProps} />);

    const textarea = screen.getByPlaceholderText('Write your idea...');
    fireEvent.change(textarea, { target: { value: 'Test idea' } });

    const postButton = screen.getByRole('button', { name: /Post Idea/i });
    expect(postButton).not.toBeDisabled();

    fireEvent.click(postButton);

    await waitFor(() => {
      expect(mockData.createIdea).toHaveBeenCalledWith('Test idea', 'agree');
    });
  });

  it('onIdeaCreated callback fires', async () => {
    const onIdeaCreated = vi.fn();
    const mockIdea = {
      id: 'idea-456',
      text: 'Another idea',
      createdAt: new Date().toISOString(),
      engagements: [],
      comments: [],
    };
    vi.mocked(mockData.createIdea).mockReturnValue(mockIdea);

    render(<CreateIdeaModal {...defaultProps} onIdeaCreated={onIdeaCreated} />);

    const textarea = screen.getByPlaceholderText('Write your idea...');
    fireEvent.change(textarea, { target: { value: 'Another idea' } });

    const postButton = screen.getByRole('button', { name: /Post Idea/i });
    fireEvent.click(postButton);

    await waitFor(() => {
      expect(onIdeaCreated).toHaveBeenCalledWith('idea-456');
    });
  });

  it('Modal closes after post', async () => {
    const onClose = vi.fn();
    const mockIdea = {
      id: 'idea-789',
      text: 'Close test',
      createdAt: new Date().toISOString(),
      engagements: [],
      comments: [],
    };
    vi.mocked(mockData.createIdea).mockReturnValue(mockIdea);

    render(<CreateIdeaModal {...defaultProps} onClose={onClose} />);

    const textarea = screen.getByPlaceholderText('Write your idea...');
    fireEvent.change(textarea, { target: { value: 'Close test' } });

    const postButton = screen.getByRole('button', { name: /Post Idea/i });
    fireEvent.click(postButton);

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('can close modal with X', () => {
    const onClose = vi.fn();
    render(<CreateIdeaModal {...defaultProps} onClose={onClose} />);

    const closeButton = screen.getByRole('button', { name: /Close/i });
    fireEvent.click(closeButton);

    // Should close immediately if no text
    expect(onClose).toHaveBeenCalled();
  });

  it('can close modal with Escape key', () => {
    const onClose = vi.fn();
    render(<CreateIdeaModal {...defaultProps} onClose={onClose} />);

    fireEvent.keyDown(window, { key: 'Escape' });

    // Should close immediately if no text
    expect(onClose).toHaveBeenCalled();
  });

  describe('P2 Polish Tests', () => {
    it('Character counter updates live', () => {
      render(<CreateIdeaModal {...defaultProps} />);
      const textarea = screen.getByPlaceholderText('Write your idea...');

      fireEvent.change(textarea, { target: { value: 'Hello' } });

      expect(screen.getByText(/5 \/ 280/)).toBeInTheDocument();
    });

    it('Discard confirmation shows if text > 10 chars', () => {
      const onClose = vi.fn();
      render(<CreateIdeaModal {...defaultProps} onClose={onClose} />);

      const textarea = screen.getByPlaceholderText('Write your idea...');
      fireEvent.change(textarea, { target: { value: 'This is more than 10 chars' } });

      const closeButton = screen.getByRole('button', { name: /Close/i });
      fireEvent.click(closeButton);

      // Should show confirmation
      expect(screen.getByText('Discard draft?')).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();

      // Click discard
      const discardButton = screen.getByRole('button', { name: /Discard/i });
      fireEvent.click(discardButton);

      expect(onClose).toHaveBeenCalled();
    });

    it('Prefill text works', () => {
      render(<CreateIdeaModal {...defaultProps} prefillText="Prefilled idea" />);

      const textarea = screen.getByPlaceholderText('Write your idea...');
      expect(textarea).toHaveValue('Prefilled idea');
    });

    it('Default position can be changed', () => {
      render(<CreateIdeaModal {...defaultProps} defaultPosition="disagree" />);

      const buttons = screen.getAllByRole('button');
      const positionButtons = buttons.filter(btn =>
        btn.textContent?.match(/Agree|Disagree|Unsure/)
      );
      const disagreeButton = positionButtons.find(btn => btn.textContent === 'Disagree')!;

      expect(disagreeButton).toHaveClass('border-blue-500');
    });
  });
});
