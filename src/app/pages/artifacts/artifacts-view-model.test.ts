import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  agoPhrase,
  buildArtifacts,
  canvasMeta,
  draftMeta,
  filterByQuery,
  filterByType,
  parseTab,
  parseType,
  receivedInboxItems,
  receivedLetterMeta,
  repliedCountByLetter,
  senderActivityItems,
  sentMeta,
  sharedMeta,
  unreadSharedCount,
  visibleRows,
  yoursSections,
  type ArtifactsSource,
} from './artifacts-view-model';
import type { ClarityDoc, InboxItem, LetterDelivery } from '@/app/types';
import type { CanvasSharedWithMe, MyCanvasRow } from '@/app/data/canvas-service';
import { canvasTitle } from '@/lib/canvas-boxes';

const NOW = new Date('2026-10-23T12:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const H = 3600_000;
const D = 24 * H;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

const doc = (over: Partial<ClarityDoc> = {}): ClarityDoc =>
  ({ id: 'd1', title: 'My draft', visibility: 'private', updated_at: ago(2 * H), story_count: 2, point_count: 3, has_sent_letters: false, ...over }) as ClarityDoc;

const letter = (over: Record<string, unknown> = {}) =>
  ({ id: 'l1', source_doc_id: 'd9', sender_id: 'me', mode: 'one-to-one', status: 'sealed', sealed_at: ago(D), created_at: ago(D), doc_title: 'Sent letter', ...over }) as ArtifactsSource['sentLetters'][number];

const delivery = (over: Partial<LetterDelivery> = {}): LetterDelivery =>
  ({ id: 'dv1', letter_id: 'l1', receiver_email: 'a@example.com', receiver_profile_id: null, receiver_name: 'Ann', status: 'sent', ...over }) as LetterDelivery;

const inboxItem = (over: Partial<InboxItem> = {}): InboxItem => ({
  type: 'received', delivery_id: 'rd1', letter_id: 'rl1', title: 'From Mara', actor_name: 'Mara', actor_slug: 'mara',
  timestamp: ago(H), read_at: null, completed_at: null, ...over,
});

const myCanvas = (over: Partial<MyCanvasRow> = {}): MyCanvasRow => ({
  canvasId: null, name: 'sales_map', generalAccess: 'restricted', hasAudience: false, lastEdit: ago(3 * D), ...over,
});

const sharedCanvas = (over: Partial<CanvasSharedWithMe> = {}): CanvasSharedWithMe => ({
  canvasId: 'c1', name: 'q4_plan', ownerId: 'o1', ownerName: 'Tom', ownerSlug: 'tom', ownerAvatarUrl: null, ownerAvatarColor: null,
  via: 'person', viaName: null, sharedAt: ago(30 * 60_000), unread: true, ...over,
});

const source = (over: Partial<ArtifactsSource> = {}): ArtifactsSource => ({
  docs: [], sentLetters: [], deliveriesByLetter: {}, inbox: [], myCanvases: [], sharedCanvases: [], userSlug: 'me', ...over,
});

describe('meta strings (Resolved Decisions: one line)', () => {
  it('agoPhrase reads relative times, "just now" and dates', () => {
    expect(agoPhrase(ago(2 * H))).toBe('2h ago');
    expect(agoPhrase(ago(10_000))).toBe('just now');
    expect(agoPhrase(ago(30 * D))).toMatch(/^on [A-Z][a-z]{2} \d{1,2}$/);
    expect(agoPhrase(null)).toBe('');
  });

  it('draft: "Draft · 3 stories, 5 points · 2h ago"', () => {
    expect(draftMeta({ updatedAt: ago(2 * H), stories: 3, points: 5 })).toBe('Draft · 3 stories, 5 points · 2h ago');
    expect(draftMeta({ updatedAt: ago(2 * H), stories: 1, points: 1 })).toBe('Draft · 1 story, 1 point · 2h ago');
    expect(draftMeta({ updatedAt: ago(2 * H), stories: 0, points: 0 })).toBe('Draft · 0 stories, 0 points · 2h ago');
  });

  it('a draft already sent says how many letters it was used for instead of the time', () => {
    expect(draftMeta({ updatedAt: ago(2 * H), stories: 3, points: 5, sentCount: 2 })).toBe('Draft · 3 stories, 5 points · used for 2 letters');
    expect(draftMeta({ updatedAt: ago(2 * H), stories: 3, points: 5, sentCount: 1 })).toBe('Draft · 3 stories, 5 points · used for 1 letter');
  });

  it('canvasTitle: underscores read as spaces and the first letter is capitalised', () => {
    expect(canvasTitle('hiring_plan_for_q1')).toBe('Hiring plan for q1');
    expect(canvasTitle('q4_roadmap_draft')).toBe('Q4 roadmap draft');
    expect(canvasTitle('Sales')).toBe('Sales');
    expect(canvasTitle('')).toBe('');
  });

  it('sent: "Sent to 3 · 1 of 3 done · 2d ago"', () => {
    expect(sentMeta({ isPublic: false, recipientCount: 3, doneCount: 1, sealedAt: ago(2 * D) })).toBe('Sent to 3 · 1 of 3 done · 2d ago');
    expect(sentMeta({ isPublic: false, recipientCount: 3, doneCount: 0, sealedAt: ago(2 * D) })).toBe('Sent to 3 · 0 of 3 done · 2d ago');
    expect(sentMeta({ isPublic: false, recipientCount: 0, doneCount: 0, sealedAt: ago(2 * D) })).toBe('No recipients yet · 2d ago');
  });

  it('sent while something is new: "Sent to 3 · 1 new from Tom · 1h ago" (words, no dot)', () => {
    expect(sentMeta({ isPublic: false, recipientCount: 3, doneCount: 1, newCount: 1, newFrom: ['Tom'], sealedAt: ago(H) }))
      .toBe('Sent to 3 · 1 new from Tom · 1h ago');
    expect(sentMeta({ isPublic: false, recipientCount: 3, doneCount: 1, newCount: 3, newFrom: ['Tom', 'Anna'], sealedAt: ago(H) }))
      .toBe('Sent to 3 · 3 new from 2 people · 1h ago');
  });

  it('public link: "Public link · 4 done · 2d ago"', () => {
    expect(sentMeta({ isPublic: true, recipientCount: 0, doneCount: 4, sealedAt: ago(2 * D) })).toBe('Public link · 4 done · 2d ago');
    expect(sentMeta({ isPublic: true, recipientCount: 0, doneCount: 0, sealedAt: ago(2 * D) })).toBe('Public link · 0 done · 2d ago');
  });

  it('received: "From Tom · 2 of 5 steps · 4d ago" and "From Anna · done · 4d ago"', () => {
    expect(receivedLetterMeta(inboxItem({ actor_name: 'Tom', steps_completed: 2, total_steps: 5, timestamp: ago(4 * D) })))
      .toBe('From Tom · 2 of 5 steps · 4d ago');
    expect(receivedLetterMeta(inboxItem({ actor_name: 'Anna', completed_at: ago(D), steps_completed: 5, total_steps: 5, timestamp: ago(4 * D) })))
      .toBe('From Anna · done · 4d ago');
    expect(receivedLetterMeta(inboxItem({ actor_name: 'Tom', timestamp: ago(4 * D) }))).toBe('From Tom · 4d ago');
  });

  it('canvas: "Edited 3d ago"; unknown edit says "Canvas"', () => {
    expect(canvasMeta(ago(3 * D))).toBe('Edited 3d ago');
    expect(canvasMeta(null)).toBe('Canvas');
  });

  it('shared: "From Mara · 1h ago"', () => {
    expect(sharedMeta('Mara', ago(H))).toBe('From Mara · 1h ago');
    expect(sharedMeta('Mara', ago(5_000))).toBe('From Mara · Just now');
    expect(sharedMeta(null, ago(H))).toBe('From someone · 1h ago');
  });

  it('rows never list recipients or say Sealed or replied', () => {
    const { yours, shared } = buildArtifacts(source({
      docs: [doc()],
      sentLetters: [letter()],
      deliveriesByLetter: { l1: [delivery({ status: 'completed' })] },
      myCanvases: [myCanvas()],
      inbox: [inboxItem()],
      sharedCanvases: [sharedCanvas()],
    }));
    for (const r of [...yours, ...shared]) expect(r.meta).not.toMatch(/Sealed|recipients completed|replied/i);
  });
});

describe('partition of the inbox', () => {
  const sender = inboxItem({ type: 'recipient_responded', delivery_id: 'sd1', letter_id: 'l1', title: 'Sent letter', actor_name: 'Ann' });
  const progress = inboxItem({ type: 'recipient_in_progress', delivery_id: 'sd2', letter_id: 'l1' });
  const link = inboxItem({ type: 'link_respondent', delivery_id: 'sd3', letter_id: 'l1' });
  const received = inboxItem();

  it('splits received from sender-side activity', () => {
    const inbox = [received, sender, progress, link];
    expect(receivedInboxItems(inbox)).toEqual([received]);
    expect(senderActivityItems(inbox)).toEqual([sender, progress, link]);
  });

  it('sender-side activity never appears in Shared with you', () => {
    const { shared } = buildArtifacts(source({ inbox: [received, sender, progress, link] }));
    expect(shared.map(r => r.ref.deliveryId)).toEqual(['rd1']);
  });

  it('sender-side activity joins onto the sent letter\'s "N of M done"', () => {
    const { yours } = buildArtifacts(source({
      sentLetters: [letter()],
      deliveriesByLetter: { l1: [delivery({ id: 'sd1' }), delivery({ id: 'x2' })] }, // deliveries lag: none completed yet
      // Read items: unread sender activity now counts as "new" (own tests below); this one pins the done join.
      inbox: [{ ...sender, read_at: ago(H) }, { ...progress, read_at: ago(H) }],
    }));
    expect(yours[0]?.meta).toBe('Sent to 2 · 1 of 2 done · 1d ago'); // only recipient_responded counts, "reading" does not
  });

  it('replied counts a delivery once when deliveries and inbox both report it', () => {
    const counts = repliedCountByLetter(
      { l1: [delivery({ id: 'sd1', status: 'completed' }), delivery({ id: 'sd9', status: 'in_progress' })] },
      [sender, link],
    );
    expect(counts).toEqual({ l1: 2 }); // sd1 (both sources) + sd3 (inbox link respondent)
  });

  it('inbox activity never raises the unread count', () => {
    const { shared } = buildArtifacts(source({ inbox: [sender, progress, link] }));
    expect(unreadSharedCount(shared)).toBe(0);
  });
});

describe('rows', () => {
  it('counts distinct deliveries, not names: two Toms are 2 people', () => {
    const { yours } = buildArtifacts(source({
      sentLetters: [letter({ sealed_at: ago(H) })],
      deliveriesByLetter: { l1: [delivery({ id: 'dv1', receiver_name: 'Tom' }), delivery({ id: 'dv2', receiver_name: 'Tom' })] },
      newByDelivery: { dv1: 1, dv2: 1 },
    }));
    expect(yours[0]?.meta).toBe('Sent to 2 · 2 new from 2 people · 1h ago');
  });

  it('one delivery with no name reads "from someone"', () => {
    const { yours } = buildArtifacts(source({
      sentLetters: [letter({ sealed_at: ago(H) })],
      deliveriesByLetter: { l1: [delivery({ id: 'dv1', receiver_name: null })] },
      newByDelivery: { dv1: 1 },
    }));
    expect(yours[0]?.meta).toBe('Sent to 1 · 1 new from someone · 1h ago');
  });

  it('an unread recipient_responded activity item is new, and its time replaces sealed_at in text and sort', () => {
    const responded = inboxItem({ type: 'recipient_responded', delivery_id: 'dv1', letter_id: 'l1', actor_name: 'Tom', timestamp: ago(10 * 60_000), read_at: null, completed_at: ago(10 * 60_000) });
    const { yours } = buildArtifacts(source({
      docs: [doc({ updated_at: ago(2 * H) })],
      sentLetters: [letter({ sealed_at: ago(3 * D) })],
      deliveriesByLetter: { l1: [delivery({ id: 'dv1', receiver_name: 'Tom', status: 'completed' })] },
      inbox: [responded],
    }));
    expect(yours[0]?.state).toBe('sent');
    expect(yours[0]?.meta).toBe('Sent to 1 · 1 new from Tom · 10m ago');
  });

  it('a read activity item is not new', () => {
    const responded = inboxItem({ type: 'recipient_responded', delivery_id: 'dv1', letter_id: 'l1', read_at: ago(H) });
    const { yours } = buildArtifacts(source({
      sentLetters: [letter({ sealed_at: ago(3 * D) })],
      deliveriesByLetter: { l1: [delivery({ id: 'dv1', status: 'completed' })] },
      inbox: [responded],
    }));
    expect(yours[0]?.meta).toBe('Sent to 1 · 1 of 1 done · 3d ago');
  });

  it('activity and explain-backs on one delivery are not double counted', () => {
    const responded = inboxItem({ type: 'recipient_responded', delivery_id: 'dv1', letter_id: 'l1', read_at: null, timestamp: ago(H) });
    const { yours } = buildArtifacts(source({
      sentLetters: [letter({ sealed_at: ago(3 * D) })],
      deliveriesByLetter: { l1: [delivery({ id: 'dv1', receiver_name: 'Tom', status: 'completed' })] },
      inbox: [responded],
      newByDelivery: { dv1: 2 },
    }));
    expect(yours[0]?.meta).toBe('Sent to 1 · 2 new from Tom · 1h ago');
  });

  it('menu keeps quick actions only: Add recipients and Preview live on the overview page', () => {
    const withSrc = buildArtifacts(source({ sentLetters: [letter()], deliveriesByLetter: { l1: [delivery()] } })).yours[0];
    expect(withSrc?.menu.map(a => a.id)).not.toContain('add-recipients');
    expect(withSrc?.menu.map(a => a.id)).not.toContain('preview-letter');
    expect(withSrc?.menu.map(a => a.label)).not.toContain('Add recipients');
    expect(withSrc?.menu.map(a => a.label)).not.toContain('Preview letter');
  });

  it('new explain-backs show as "N new from <name>" on the sent letter', () => {
    const { yours } = buildArtifacts(source({
      sentLetters: [letter({ sealed_at: ago(H) })],
      deliveriesByLetter: { l1: [delivery({ id: 'dv1', receiver_name: 'Tom' }), delivery({ id: 'dv2', receiver_name: 'Ann' })] },
      newByDelivery: { dv1: 1 },
    }));
    expect(yours[0]?.meta).toBe('Sent to 2 · 1 new from Tom · 1h ago');
  });

  it('a draft counts the letters sent from it', () => {
    const { yours } = buildArtifacts(source({
      docs: [doc({ id: 'd9', story_count: 3, point_count: 5, has_sent_letters: true })],
      sentLetters: [letter({ id: 'l1' }), letter({ id: 'l2' })],
    }));
    expect(yours.find(r => r.state === 'draft')?.meta).toBe('Draft · 3 stories, 5 points · used for 2 letters');
  });

  it('Yours holds drafts, sent letters and own canvases, newest first', () => {
    const { yours } = buildArtifacts(source({
      docs: [doc({ updated_at: ago(2 * H) })],
      sentLetters: [letter({ sealed_at: ago(D) })],
      deliveriesByLetter: { l1: [delivery()] },
      myCanvases: [myCanvas({ lastEdit: ago(3 * D) })],
    }));
    expect(yours.map(r => r.state)).toEqual(['draft', 'sent', 'canvas']);
  });

  it('own items carry a visibility icon, shared items none; unread only on shared', () => {
    const { yours, shared } = buildArtifacts(source({
      docs: [doc({ visibility: 'public' })],
      sentLetters: [letter({ mode: 'one-to-many' })],
      myCanvases: [myCanvas({ generalAccess: 'link' }), myCanvas({ name: 'private_one' })],
      inbox: [inboxItem()],
      sharedCanvases: [sharedCanvas()],
    }));
    expect(yours.map(r => r.visibility)).toEqual(expect.arrayContaining(['public', 'private']));
    expect(yours.every(r => r.visibility !== null && r.unread === false)).toBe(true);
    expect(yours.find(r => r.ref.canvasName === 'sales_map')?.visibility).toBe('public');
    expect(shared.every(r => r.visibility === null)).toBe(true);
    expect(shared.every(r => r.unread)).toBe(true);
  });

  it('row tap targets are the items\' existing pages', () => {
    const { yours, shared } = buildArtifacts(source({
      docs: [doc()],
      sentLetters: [letter()],
      myCanvases: [myCanvas()],
      inbox: [inboxItem(), inboxItem({ delivery_id: 'rd2', letter_id: 'rl2', completed_at: ago(H), read_at: ago(H) })],
      sharedCanvases: [sharedCanvas()],
    }));
    const hrefs = Object.fromEntries([...yours, ...shared].map(r => [r.key, r.href]));
    expect(hrefs['draft:d1']).toBe('/letters/drafts/d1');
    expect(hrefs['sent:l1']).toBe('/letter/l1/overview');
    expect(hrefs['canvas:sales_map']).toBe('/p/me/canvas/sales_map');
    expect(hrefs['received:rd1']).toBe('/letter/rd1');
    expect(hrefs['received:rd2']).toBe('/letter/rl2/results?delivery=rd2');
    expect(hrefs['shared-canvas:c1']).toBe('/p/tom/canvas/q4_plan');
  });

  it('a canvas address cannot be built without a handle', () => {
    expect(buildArtifacts(source({ myCanvases: [myCanvas()], userSlug: null })).yours[0]?.href).toBeNull();
    expect(buildArtifacts(source({ sharedCanvases: [sharedCanvas({ ownerSlug: null })] })).shared[0]?.href).toBeNull();
  });

  it('canvas titles read underscores as spaces and start with a capital', () => {
    expect(buildArtifacts(source({ myCanvases: [myCanvas({ name: 'sales_map' })] })).yours[0]?.title).toBe('Sales map');
  });
});

describe('"…" menu guards (today\'s rules)', () => {
  const menu = (s: Partial<ArtifactsSource>) => buildArtifacts(source(s)).yours[0]?.menu ?? [];

  it('draft: Prepare letter needs a story; Delete is blocked once letters were sent', () => {
    expect(menu({ docs: [doc({ story_count: 0, has_sent_letters: true })] })).toEqual([
      { id: 'prepare-letter', label: 'Prepare letter', disabledReason: 'Add at least one story first.' },
      { id: 'delete-draft', label: 'Delete', danger: true, disabledReason: "Can't delete — letters were sent from this draft." },
    ]);
    const ok = menu({ docs: [doc()] });
    expect(ok.every(a => !a.disabledReason)).toBe(true);
    expect(ok.at(-1)?.danger).toBe(true);
  });

  it('sent letter: Copy public link only on public letters; Delete letter is disabled with its reason once any delivery exists', () => {
    const priv = menu({ sentLetters: [letter()] });
    expect(priv.map(a => a.id)).toEqual(['delete-letter']);
    expect(priv.at(-1)?.disabledReason).toBeUndefined();
    const pub = menu({ sentLetters: [letter({ mode: 'one-to-many' })], deliveriesByLetter: { l1: [delivery({ receiver_email: null })] } });
    expect(pub.map(a => a.id)).toEqual(['copy-public-link', 'delete-letter']);
    expect(pub.at(-1)).toMatchObject({ danger: true, disabledReason: "Can't delete — letter has been shared." });
    const sharedPrivate = menu({ sentLetters: [letter()], deliveriesByLetter: { l1: [delivery()] } });
    expect(sharedPrivate.at(-1)).toMatchObject({ id: 'delete-letter', disabledReason: "Can't delete — letter has been shared." });
  });

  it('own canvas: Share only; shared items have no menu', () => {
    expect(menu({ myCanvases: [myCanvas()] }).map(a => a.id)).toEqual(['share-canvas']);
    const { shared } = buildArtifacts(source({ inbox: [inboxItem()], sharedCanvases: [sharedCanvas()] }));
    expect(shared.every(r => r.menu.length === 0)).toBe(true);
  });
});

describe('filters and search', () => {
  const { yours } = buildArtifacts(source({
    docs: [doc({ title: 'Quarterly Review' })],
    sentLetters: [letter({ doc_title: 'Hello Tom' })],
    myCanvases: [myCanvas({ name: 'review_board' })],
  }));

  it('type chips', () => {
    expect(filterByType(yours, 'all')).toHaveLength(3);
    expect(filterByType(yours, 'letters').map(r => r.kind)).toEqual(['letter', 'letter']);
    expect(filterByType(yours, 'canvases').map(r => r.kind)).toEqual(['canvas']);
  });

  it('search is a case-insensitive title match, trimmed', () => {
    expect(filterByQuery(yours, '  REVIEW ').map(r => r.title).sort()).toEqual(['Quarterly Review', 'Review board']);
    expect(filterByQuery(yours, '')).toHaveLength(3);
    expect(filterByQuery(yours, 'nothing like it')).toEqual([]);
  });

  it('search matches titles only, not the meta line', () => {
    expect(filterByQuery(yours, 'edited')).toEqual([]);
  });

  it('type and search combine', () => {
    expect(visibleRows(yours, 'canvases', 'review').map(r => r.kind)).toEqual(['canvas']);
    expect(visibleRows(yours, 'letters', 'review').map(r => r.title)).toEqual(['Quarterly Review']);
  });
});

describe('Yours headings: Drafts, Sent, Canvases', () => {
  const { yours } = buildArtifacts(source({
    // Newest first overall would interleave the kinds: the headings must still group them.
    docs: [doc({ id: 'dA', title: 'Older draft', updated_at: ago(5 * D) }), doc({ id: 'dB', title: 'Newer draft', updated_at: ago(H) })],
    sentLetters: [letter({ id: 'l1', doc_title: 'Sent letter', sealed_at: ago(2 * H) })],
    myCanvases: [myCanvas({ name: 'review_board', lastEdit: ago(30 * 60_000) })],
  }));

  it('groups in the order Drafts, Sent, Canvases, newest first inside each', () => {
    const sections = yoursSections(yours);
    expect(sections.map(s => s.title)).toEqual(['Drafts', 'Sent', 'Canvases']);
    expect(sections.map(s => s.id)).toEqual(['drafts', 'sent', 'canvases']);
    expect(sections[0]?.rows.map(r => r.title)).toEqual(['Newer draft', 'Older draft']);
    expect(sections[1]?.rows.map(r => r.title)).toEqual(['Sent letter']);
    expect(sections[2]?.rows.map(r => r.title)).toEqual(['Review board']);
  });

  it('a heading with no rows is not returned', () => {
    expect(yoursSections(yours.filter(r => r.state === 'draft')).map(s => s.title)).toEqual(['Drafts']);
    expect(yoursSections(yours.filter(r => r.state !== 'sent')).map(s => s.title)).toEqual(['Drafts', 'Canvases']);
    expect(yoursSections([])).toEqual([]);
  });

  it('chips and search filter inside the headings, and a heading whose rows are all filtered out disappears', () => {
    expect(yoursSections(visibleRows(yours, 'letters', '')).map(s => s.title)).toEqual(['Drafts', 'Sent']);
    expect(yoursSections(visibleRows(yours, 'canvases', '')).map(s => s.title)).toEqual(['Canvases']);
    const searched = yoursSections(visibleRows(yours, 'all', 'newer'));
    expect(searched.map(s => s.title)).toEqual(['Drafts']);
    expect(searched[0]?.rows.map(r => r.title)).toEqual(['Newer draft']);
    expect(yoursSections(visibleRows(yours, 'all', 'zzz'))).toEqual([]);
  });

  it('a tap in Drafts always edits and a tap in Sent always opens the overview', () => {
    const sections = yoursSections(yours);
    expect(sections[0]?.rows.every(r => r.href?.startsWith('/letters/drafts/'))).toBe(true);
    expect(sections[1]?.rows.every(r => /^\/letter\/[^/]+\/overview$/.test(r.href ?? ''))).toBe(true);
    expect(sections[2]?.rows.every(r => r.href === '/p/me/canvas/review_board')).toBe(true);
  });

  it('a draft that was already sent stays under Drafts; a public-link letter is under Sent', () => {
    const built = buildArtifacts(source({
      docs: [doc({ id: 'd9', title: 'Already sent', has_sent_letters: true })],
      sentLetters: [letter({ id: 'l2', source_doc_id: 'd9', doc_title: 'Public one', mode: 'one-to-many' })],
    }));
    const sections = yoursSections(built.yours);
    expect(sections.map(s => [s.title, s.rows.map(r => r.title)])).toEqual([['Drafts', ['Already sent']], ['Sent', ['Public one']]]);
  });
});

describe('unread rules', () => {
  it('counts unread letters and canvases in Shared with you', () => {
    const { shared } = buildArtifacts(source({
      inbox: [inboxItem(), inboxItem({ delivery_id: 'rd2', read_at: ago(H) })],
      sharedCanvases: [sharedCanvas(), sharedCanvas({ canvasId: 'c2', unread: false })],
    }));
    expect(unreadSharedCount(shared)).toBe(2);
  });

  it('items opened on the page stop counting at once', () => {
    const { shared } = buildArtifacts(source({ inbox: [inboxItem()], sharedCanvases: [sharedCanvas()] }));
    expect(unreadSharedCount(shared, new Set(['received:rd1']))).toBe(1);
  });
});

describe('url state', () => {
  it('tab defaults to yours; type defaults to all; junk falls back', () => {
    expect(parseTab(null)).toBe('yours');
    expect(parseTab('shared')).toBe('shared');
    expect(parseTab('inbox')).toBe('yours');
    expect(parseType(null)).toBe('all');
    expect(parseType('canvases')).toBe('canvases');
    expect(parseType('letters')).toBe('letters');
    expect(parseType('toString')).toBe('all');
  });
});
