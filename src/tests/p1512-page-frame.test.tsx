/**
 * @file p1512-page-frame.test.tsx
 * @description P1512: every signed-in shell page wears ONE page frame (title row, action slot, left edge).
 * The layout itself cannot be measured in jsdom — the rendered y/x/size numbers were checked in a real
 * browser — so this pins the pieces that must stay in step: the component's own contract, and that each
 * page still routes its heading through it instead of drawing its own.
 */
import { readFileSync } from 'node:fs';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { EventsList } from '@/app/prototypes/events/components/EventsList';
import { PageFrame, PageHeader } from '@/app/components/layout/page-header';

vi.mock('@/auth', () => ({ useAuth: () => ({ user: { id: 'user-id-1234' } }) }));
vi.mock('@/app/data/events-service', () => ({
  eventsService: {
    getUpcomingEvents: vi.fn().mockResolvedValue([]),
    getPastEvents: vi.fn().mockResolvedValue([]),
    isUserRsvpd: vi.fn().mockResolvedValue(false),
  },
}));

const read = (rel: string) => readFileSync(`${process.cwd()}/${rel}`, 'utf8');

describe('P1512 PageHeader / PageFrame', () => {
  it('renders the title as the page h1 with the action on the same row', () => {
    render(
      <PageFrame>
        <PageHeader title="Events" actions={<button type="button">Host Event</button>} />
      </PageFrame>,
    );
    const h1 = screen.getByRole('heading', { level: 1, name: 'Events' });
    const action = screen.getByRole('button', { name: 'Host Event' });
    expect(h1.parentElement).toBe(action.parentElement?.parentElement);
    // The row is 40px tall (the action's height): the 56px top bar above it carries the sidebar-logo line.
    expect(h1.parentElement?.className).toContain('min-h-10');
  });

  it('puts the description under the title row, not inside it', () => {
    render(<PageHeader title="Clarity Groups" description="One line." />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.parentElement).not.toContainElement(screen.getByText('One line.'));
  });

  it('renders no action slot when there is no action', () => {
    const { container } = render(<PageHeader title="Settings" />);
    expect(container.querySelectorAll('header > div > div')).toHaveLength(0);
  });

  it('keeps one left edge: shell frame is left-aligned, outside the shell it is the nav container', () => {
    const { container } = render(<PageFrame size="reading">x</PageFrame>);
    const frame = container.firstElementChild as HTMLElement;
    // Same classes as SimpleNavigation's container, so signed-out titles line up with the logo.
    for (const cls of ['container', 'mx-auto', 'px-4', 'lg:px-8']) expect(frame.className).toContain(cls);
    // Inside the shell (ancestor carries data-shell-top-nav) it is never centred.
    expect(frame.className).toContain('[[data-shell-top-nav]_&]:mx-0');
    expect(frame.className).toContain('[[data-shell-top-nav]_&]:max-w-6xl');
    expect(frame.dataset.pageFrame).toBe('reading');
  });
});

describe('P1512 every shell page uses the frame', () => {
  // The seven pages the founder named. A page that draws its own h1 again would start at its own
  // height and size, which is the drift this frame exists to stop.
  it.each([
    'src/app/pages/feed-page.tsx',
    'src/app/pages/org-directory-page.tsx',
    'src/app/prototypes/events/components/EventsList.tsx',
    'src/app/pages/letters-page.tsx',
    'src/app/pages/profile-connections-page.tsx',
    'src/app/pages/settings-page.tsx',
    'src/app/pages/my-sessions-page.tsx',
  ])('%s renders its heading through PageHeader', (file) => {
    const src = read(file);
    expect(src).toContain("layout/page-header");
    expect(src).toMatch(/<PageHeader[\s\n]/);
    expect(src, 'a page-local <h1> bypasses the shared title row').not.toMatch(/<h1[\s>]/);
  });

  it('Partners keeps Back only on someone else\'s page (it has no other way out)', () => {
    const src = read('src/app/pages/profile-connections-page.tsx');
    // Declared with FocusHeader (it portals into the shell's top bar); never on the owner's own page.
    expect(src).toMatch(/\{!isOwner && <FocusHeader fallback=/);
  });
});

describe('P1512 render-level: the heading really is inside the frame header', () => {
  // The source greps above would pass a page that renders PageHeader in only one branch. These
  // render the page and look at the DOM.
  it('standalone Events: exactly one h1, inside [data-page-frame] > [data-page-header], with its action', async () => {
    const { container } = render(<MemoryRouter><EventsList /></MemoryRouter>);
    await screen.findByRole('tab', { name: /Upcoming \(0\)/ });
    const h1s = container.querySelectorAll('h1');
    expect(h1s).toHaveLength(1);
    const h1 = h1s[0] as HTMLElement;
    expect(h1.textContent).toBe('Events');
    expect(h1.closest('[data-page-frame] [data-page-header]')).not.toBeNull();
    // The filters sit on the next row, in the same frame, not beside the title.
    const tablist = screen.getByRole('tablist', { name: 'Event filters' });
    expect(tablist.closest('[data-page-frame]')).toBe(h1.closest('[data-page-frame]'));
    expect(tablist.closest('[data-page-header]')).toBeNull();
  });

  it('embedded Events (group page): no title and no frame; the host page owns both', async () => {
    const { container } = render(<MemoryRouter><EventsList embedded orgId="org-id-1234" orgSlug="org-slug" /></MemoryRouter>);
    await screen.findByRole('tab', { name: /Upcoming \(0\)/ });
    expect(container.querySelector('h1')).toBeNull();
    expect(container.querySelector('[data-page-frame]')).toBeNull();
    expect(screen.getByRole('tablist', { name: 'Event filters' })).toBeInTheDocument();
  });
});
