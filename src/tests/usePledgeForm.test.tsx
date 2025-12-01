import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePledgeForm } from '@/hooks/use-pledge-form';

// Mock dependencies
vi.mock('@/app/data/api', () => ({
  createProfile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/confetti', () => ({
  triggerConfetti: vi.fn(),
}));

describe('usePledgeForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('initial state', () => {
    it('initializes with empty form fields', () => {
      const { result } = renderHook(() => usePledgeForm());

      expect(result.current.formState.name).toBe('');
      expect(result.current.formState.email).toBe('');
      expect(result.current.formState.role).toBe('');
      expect(result.current.formState.linkedinUrl).toBe('');
      expect(result.current.formState.reason).toBe('');
      expect(result.current.formState.isSubmitting).toBe(false);
      expect(result.current.formState.error).toBe('');
    });
  });

  describe('required fields validation', () => {
    it('shows error when name is empty', async () => {
      const { result } = renderHook(() => usePledgeForm());

      act(() => {
        result.current.setters.setEmail('test@example.com');
      });

      await act(async () => {
        await result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
      });

      expect(result.current.formState.error).toBe('Please fill in your name and email to sign the pledge.');
    });

    it('shows error when email is empty', async () => {
      const { result } = renderHook(() => usePledgeForm());

      act(() => {
        result.current.setters.setName('John Doe');
      });

      await act(async () => {
        await result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
      });

      expect(result.current.formState.error).toBe('Please fill in your name and email to sign the pledge.');
    });

    it('shows error when both name and email are empty', async () => {
      const { result } = renderHook(() => usePledgeForm());

      await act(async () => {
        await result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
      });

      expect(result.current.formState.error).toBe('Please fill in your name and email to sign the pledge.');
    });

    it('shows error when name is only whitespace', async () => {
      const { result } = renderHook(() => usePledgeForm());

      act(() => {
        result.current.setters.setName('   ');
        result.current.setters.setEmail('test@example.com');
      });

      await act(async () => {
        await result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
      });

      expect(result.current.formState.error).toBe('Please fill in your name and email to sign the pledge.');
    });
  });

  describe('email format validation', () => {
    it('shows error for invalid email without @', async () => {
      const { result } = renderHook(() => usePledgeForm());

      act(() => {
        result.current.setters.setName('John Doe');
        result.current.setters.setEmail('invalidemail');
      });

      await act(async () => {
        await result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
      });

      expect(result.current.formState.error).toBe('Please enter a valid email address.');
    });

    it('shows error for email without domain', async () => {
      const { result } = renderHook(() => usePledgeForm());

      act(() => {
        result.current.setters.setName('John Doe');
        result.current.setters.setEmail('test@');
      });

      await act(async () => {
        await result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
      });

      expect(result.current.formState.error).toBe('Please enter a valid email address.');
    });

    it('shows error for email without TLD', async () => {
      const { result } = renderHook(() => usePledgeForm());

      act(() => {
        result.current.setters.setName('John Doe');
        result.current.setters.setEmail('test@example');
      });

      await act(async () => {
        await result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
      });

      expect(result.current.formState.error).toBe('Please enter a valid email address.');
    });

    it('shows error for email with spaces', async () => {
      const { result } = renderHook(() => usePledgeForm());

      act(() => {
        result.current.setters.setName('John Doe');
        result.current.setters.setEmail('test @example.com');
      });

      await act(async () => {
        await result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
      });

      expect(result.current.formState.error).toBe('Please enter a valid email address.');
    });

    it('accepts valid email format', async () => {
      const { result } = renderHook(() => usePledgeForm());

      act(() => {
        result.current.setters.setName('John Doe');
        result.current.setters.setEmail('test@example.com');
      });

      await act(async () => {
        await result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
      });

      expect(result.current.formState.error).toBe('');
    });

    it('accepts email with subdomain', async () => {
      const { result } = renderHook(() => usePledgeForm());

      act(() => {
        result.current.setters.setName('John Doe');
        result.current.setters.setEmail('test@mail.example.com');
      });

      await act(async () => {
        await result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
      });

      expect(result.current.formState.error).toBe('');
    });

    it('accepts email with plus sign', async () => {
      const { result } = renderHook(() => usePledgeForm());

      act(() => {
        result.current.setters.setName('John Doe');
        result.current.setters.setEmail('test+tag@example.com');
      });

      await act(async () => {
        await result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
      });

      expect(result.current.formState.error).toBe('');
    });
  });

  describe('form setters', () => {
    it('updates name field', () => {
      const { result } = renderHook(() => usePledgeForm());

      act(() => {
        result.current.setters.setName('Jane Doe');
      });

      expect(result.current.formState.name).toBe('Jane Doe');
    });

    it('updates email field', () => {
      const { result } = renderHook(() => usePledgeForm());

      act(() => {
        result.current.setters.setEmail('jane@example.com');
      });

      expect(result.current.formState.email).toBe('jane@example.com');
    });

    it('updates all optional fields', () => {
      const { result } = renderHook(() => usePledgeForm());

      act(() => {
        result.current.setters.setRole('Engineer');
        result.current.setters.setLinkedinUrl('linkedin.com/in/jane');
        result.current.setters.setReason('For clarity');
      });

      expect(result.current.formState.role).toBe('Engineer');
      expect(result.current.formState.linkedinUrl).toBe('linkedin.com/in/jane');
      expect(result.current.formState.reason).toBe('For clarity');
    });
  });
});
