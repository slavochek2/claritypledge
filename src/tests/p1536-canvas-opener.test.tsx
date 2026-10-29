/**
 * @file p1536-canvas-opener.test.tsx
 * @description P1536: what opens a canvas thread (one message and a steps card) and the prompt for the owner's own AI.
 *  - Copy prompt puts CANVAS_OWN_AI_PROMPT on the clipboard and the button says "Copied" for about two seconds;
 *  - it is the one filled blue button only while nothing has been added (otherwise an outline, P955);
 *  - "What gets copied" shows the prompt text;
 *  - when the clipboard refuses, the same text opens in a dialog to copy by hand;
 *  - the prompt names the nine boxes by the code's titles, in order, and stays short.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { CanvasThreadOpener } from '@/app/pages/chat/CanvasOpener';
import { CANVAS_OPENER_ASK, CANVAS_OWN_AI_PROMPT } from '@/app/pages/chat/canvas-thread-copy';
import { COPIED_MS } from '@/app/pages/chat/use-copy-prompt';
import { CANVAS_BOXES } from '@/lib/canvas-boxes';

function stubClipboard(writeText: (t: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
});

describe('the opener', () => {
  it('is one message and a steps card: "Want to save time?" with Copy prompt, paste, upload (the founder\'s words of 2026-10-28)', () => {
    render(<CanvasThreadOpener title={null} />);
    expect(CANVAS_OPENER_ASK).toBe(
      "I'll help you get clear on your offer and draft your Clarity Canvas. Send me anything about what you build or sell: your website link, a pitch deck, notes.",
    );
    expect(screen.getByTestId('canvas-opener-ask')).toHaveTextContent(CANVAS_OPENER_ASK);
    const steps = screen.getByTestId('canvas-opener-steps');
    expect(within(steps).getByRole('heading', { name: 'Want to save time?' })).toBeInTheDocument();
    const items = within(steps).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('1');
    expect(within(items[0] as HTMLElement).getByRole('button', { name: 'Copy prompt' })).toBeInTheDocument();
    expect(items[1]).toHaveTextContent('2Paste it into ChatGPT, Gemini or Claude');
    expect(items[2]).toHaveTextContent('3Upload the answer here');
    // one message, not two: there is no second opener message
    expect(screen.queryByTestId('canvas-opener-prompt')).not.toBeInTheDocument();
  });

  it('Copy prompt copies the prompt and the button says "Copied" for about two seconds, then Copy prompt again', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn(async () => undefined);
    stubClipboard(writeText);
    render(<CanvasThreadOpener title={null} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy prompt' }));
    });
    expect(writeText).toHaveBeenCalledWith(CANVAS_OWN_AI_PROMPT);
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy prompt' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(COPIED_MS + 50);
    });
    expect(screen.getByRole('button', { name: 'Copy prompt' })).toBeInTheDocument();
    expect(COPIED_MS).toBe(2000);
  });

  it('Copy prompt is the one filled blue button only while nothing has been added; otherwise an outline', () => {
    const { rerender } = render(<CanvasThreadOpener title={null} primary />);
    const blue = (b: HTMLElement) => b.className.includes('bg-blue-600');
    expect(blue(screen.getByRole('button', { name: 'Copy prompt' }))).toBe(true);
    rerender(<CanvasThreadOpener title={null} primary={false} />);
    const outline = screen.getByRole('button', { name: 'Copy prompt' });
    expect(blue(outline)).toBe(false);
    expect(outline.className).toContain('border');
  });

  it('"What gets copied" shows the prompt text, and hides it again', () => {
    render(<CanvasThreadOpener title={null} />);
    const toggle = screen.getByRole('button', { name: 'What gets copied' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('canvas-prompt-preview')).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('canvas-prompt-preview').textContent).toBe(CANVAS_OWN_AI_PROMPT);
    fireEvent.click(toggle);
    expect(screen.queryByTestId('canvas-prompt-preview')).not.toBeInTheDocument();
  });

  it('when the clipboard fails, the text opens in a dialog to copy by hand (and no "Copied" is claimed)', async () => {
    stubClipboard(async () => {
      throw new Error('denied');
    });
    render(<CanvasThreadOpener title={null} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy prompt' }));
    });
    expect(screen.queryByRole('button', { name: 'Copied' })).not.toBeInTheDocument();
    const dialog = await screen.findByRole('dialog');
    expect((within(dialog).getByTestId('canvas-prompt-text') as HTMLTextAreaElement).value).toBe(CANVAS_OWN_AI_PROMPT);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('with no clipboard at all, the same fallback', async () => {
    render(<CanvasThreadOpener title={null} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy prompt' }));
    });
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});

describe('CANVAS_OWN_AI_PROMPT', () => {
  it('names the nine boxes by the code titles, in the code order', () => {
    const headings = CANVAS_OWN_AI_PROMPT.split('\n').filter((l) => l.startsWith('## ')).map((l) => l.slice(3));
    expect(headings).toEqual(CANVAS_BOXES.map((b) => b.title));
    expect(headings).toHaveLength(9);
  });

  it('asks for one Markdown file with a "Source:" line each, "Not known yet", no invented numbers, no other people; stays under about 1100 words (Design v6 S2: the nine definitions and the writing rules)', () => {
    for (const phrase of ['Markdown', 'This canvas is about', 'Source:', 'Not known yet', 'Never invent numbers', 'Never use the names of other people']) {
      expect(CANVAS_OWN_AI_PROMPT).toContain(phrase);
    }
    expect(CANVAS_OWN_AI_PROMPT.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(1100);
  });

  it('carries the definition and the shape of every box (the examples stay in the drafting prompt)', () => {
    expect(CANVAS_OWN_AI_PROMPT.match(/^Shape: /gm)).toHaveLength(9);
  });
});
