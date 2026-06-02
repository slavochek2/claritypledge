/**
 * @file p857-oath-emphasis.test.tsx
 * @description Guards the shared-emphasis refactor (P857): the bolded phrases of
 * the v4 oath are single-sourced in VERIFIED_UNDERSTANDING_OATH[4].boldPhrases
 * and rendered by the shared <OathText> helper. Both the pledge and the agreement
 * consume it, so this also guards the live-pledge renderer migration (previously
 * the pledge's v4 render had NO test coverage).
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OathText } from '@/app/content/oath-emphasis';
import {
  YourRightTextTailwind,
  MyPromiseTextTailwind,
  ExceptionTextTailwind,
  MyPromiseText,
} from '@/app/content/pledge-text';
import { VERIFIED_UNDERSTANDING_OATH } from '@/app/content/verified-understanding-oath';

// ---------------------------------------------------------------------------
// OathText — the shared renderer
// ---------------------------------------------------------------------------
describe('OathText — shared emphasis renderer', () => {
  it('wraps each boldPhrase in a font-bold span (tailwind variant)', () => {
    render(<div>{OathText({ text: 'a PHRASE b', boldPhrases: ['PHRASE'], variant: 'tailwind' })}</div>);
    const bold = screen.getByText('PHRASE');
    expect(bold.tagName).toBe('SPAN');
    expect(bold).toHaveClass('font-bold');
  });

  it('uses inline fontWeight:bold for the inline (export) variant', () => {
    render(<div>{OathText({ text: 'a PHRASE b', boldPhrases: ['PHRASE'], variant: 'inline' })}</div>);
    expect(screen.getByText('PHRASE')).toHaveStyle({ fontWeight: 'bold' });
  });

  it('splits \\n\\n into block paragraphs (first block, rest block mt-3)', () => {
    const { container } = render(
      <div>{OathText({ text: 'para one\n\npara two', boldPhrases: [], variant: 'tailwind' })}</div>,
    );
    const blocks = container.querySelectorAll('span.block');
    expect(blocks.length).toBe(2);
    expect(blocks[1]).toHaveClass('mt-3');
  });

  it('renders plain text with no bold when boldPhrases is empty', () => {
    const { container } = render(
      <div>{OathText({ text: 'just plain text', boldPhrases: [], variant: 'tailwind' })}</div>,
    );
    expect(container.querySelector('.font-bold')).toBeNull();
    expect(screen.getByText('just plain text')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Pledge v4 renderers — migration guard (DOM must stay byte-identical)
// ---------------------------------------------------------------------------
describe('Pledge v4 renderers — emphasis single-sourced (P857 migration guard)', () => {
  it('YourRight v4 bolds the cognitive-understanding phrase', () => {
    render(<div>{YourRightTextTailwind({ version: 4 })}</div>);
    expect(screen.getByText('how well I assume I cognitively understand')).toHaveClass('font-bold');
  });

  it('MyPromise v4 bolds all three key phrases', () => {
    render(<div>{MyPromiseTextTailwind({ version: 4 })}</div>);
    expect(screen.getByText('honest number')).toHaveClass('font-bold');
    expect(screen.getByText('without judging or criticizing')).toHaveClass('font-bold');
    expect(screen.getByText('the lower of our two numbers')).toHaveClass('font-bold');
  });

  it('MyPromise v4 keeps the three-paragraph block structure', () => {
    const { container } = render(<div>{MyPromiseTextTailwind({ version: 4 })}</div>);
    expect(container.querySelectorAll('span.block').length).toBe(3);
  });

  it('MyPromise v4 inline (export path) uses inline fontWeight:bold', () => {
    render(<div>{MyPromiseText({ version: 4 })}</div>);
    expect(screen.getByText('honest number')).toHaveStyle({ fontWeight: 'bold' });
  });

  it('Exception v4 renders its text with no bold', () => {
    const { container } = render(<div>{ExceptionTextTailwind({ version: 4 })}</div>);
    expect(
      screen.getByText("If I can't give you an honest number in the moment, I'll explain why."),
    ).toBeInTheDocument();
    expect(container.querySelector('.font-bold')).toBeNull();
  });

  it('the constant is the single source of which phrases are bold', () => {
    expect(VERIFIED_UNDERSTANDING_OATH[4].yourRight.boldPhrases).toEqual([
      'how well I assume I cognitively understand',
    ]);
    expect(VERIFIED_UNDERSTANDING_OATH[4].myPromise.boldPhrases).toEqual([
      'honest number',
      'without judging or criticizing',
      'the lower of our two numbers',
    ]);
    expect(VERIFIED_UNDERSTANDING_OATH[4].exception.boldPhrases).toEqual([]);
  });
});
