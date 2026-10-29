/** P1590: the two composer mic buttons must look different. */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DictationMic } from '@/app/pages/chat/DictationControls';
import { VoiceMic } from '@/app/pages/chat/VoiceControls';

describe('P1590 mic icons', () => {
  it('dictation button shows audio-lines plus "Aa"', () => {
    render(<DictationMic onClick={() => {}} disabled={false} />);
    const btn = screen.getByRole('button', { name: 'Dictate a message' });
    expect(btn.textContent).toContain('Aa');
    expect(btn.querySelector('svg.lucide-audio-lines')).not.toBeNull();
  });

  it('voice-note button shows a mic and no "Aa"', () => {
    render(<VoiceMic onClick={() => {}} disabled={false} />);
    const btn = screen.getByRole('button', { name: 'Record a voice message' });
    expect(btn.querySelector('svg.lucide-mic')).not.toBeNull();
    expect(btn.textContent).not.toContain('Aa');
  });
});
