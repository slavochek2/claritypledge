/**
 * @file p1264-org-footer-note.test.tsx
 * @description P1264 — the org's standing note is the last block on an event page,
 * renders nothing when unset, and is protocol-guarded like any user-authored markdown.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OrgFooterNote } from '@/app/prototypes/events/components/OrgFooterNote';

describe('OrgFooterNote', () => {
  it('renders the note as markdown', () => {
    render(<OrgFooterNote note="*PS. See the [calendar](https://claritypledge.com/cm)*" />);
    const link = screen.getByRole('link', { name: 'calendar' });
    expect(link).toHaveAttribute('href', 'https://claritypledge.com/cm');
  });

  it('renders nothing when the org has no note', () => {
    const { container } = render(<OrgFooterNote note={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for a note cleared to whitespace', () => {
    // A note blanked in the DB must not leave an empty bordered block on the page.
    // Expression form, not a plain string attribute: JSX does not interpret escapes
    // in `note="   \n  "`, so that would pass real backslash-n characters and trim()
    // would correctly keep them.
    const { container } = render(<OrgFooterNote note={'   \n  '} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('drops a javascript: link rather than rendering it as an href', () => {
    // Same protocol allowlist the description gets — the note goes through
    // renderMarkdownSafe, so this is a property of the render path, not of the data.
    const { container } = render(<OrgFooterNote note="[tap](javascript:alert(1))" />);
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toContain('tap');
  });

  it('strips raw HTML embedded in the note', () => {
    const { container } = render(<OrgFooterNote note='before <img src=x onerror="alert(1)"> after' />);
    expect(container.querySelector('img')).toBeNull();
  });
});
