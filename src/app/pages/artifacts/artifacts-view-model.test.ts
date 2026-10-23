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
  repliedCountByLetter,
  senderActivityItems,
  sentMeta,
  sharedMeta,
  unreadSharedCount,
  visibleRows,
  type ArtifactsSource,
} from './artifacts-view-model';
import type { ClarityDoc, InboxItem, LetterDelivery } from '@/app/types';
import type { CanvasSharedWithMe, MyCanvasRow } from '@/app/data/canvas-service';

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

  it('draft: "Draft · edited 2h ago"', () => {
    expect(draftMeta(ago(2 * H))).toBe('Draft · edited 2h ago');
  });

  it('sent: "Sent to 3 · 1 replied"; no replies drops the reply part', () => {
    expect(sentMeta({ isPublic: false, recipientCount: 3, repliedCount: 1 })).toBe('Sent to 3 · 1 replied');
    expect(sentMeta({ isPublic: false, recipientCount: 3, repliedCount: 0 })).toBe('Sent to 3');
    expect(sentMeta({ isPublic: false, recipientCount: 0, repliedCount: 0 })).toBe('No recipients yet');
  });

  it('public link: "Public link · 2 replied"', () => {
    expect(sentMeta({ isPublic: true, recipientCount: 0, repliedCount: 2 })).toBe('Public link · 2 replied');
    expect(sentMeta({ isPublic: true, recipientCount: 0, repliedCount: 0 })).toBe('Public link');
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

  it('never mentions stories, points, Sealed or recipients lists', () => {
    const { yours, shared } = buildArtifacts(source({
      docs: [doc()],
      sentLetters: [letter()],
      deliveriesByLetter: { l1: [delivery({ status: 'completed' })] },
      myCanvases: [myCanvas()],
      inbox: [inboxItem()],
      sharedCanvases: [sharedCanvas()],
    }));
    for (const r of [...yours, ...shared]) expect(r.meta).not.toMatch(/stor(y|ies)|point|Sealed|recipients completed/i);
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

  it('sender-side activity joins onto the sent letter\'s "N replied"', () => {
    const { yours } = buildArtifacts(source({
      sentLetters: [letter()],
      deliveriesByLetter: { l1: [delivery({ id: 'sd1' }), delivery({ id: 'x2' })] }, // deliveries lag: none completed yet
      inbox: [sender, progress],
    }));
    expect(yours[0]?.meta).toBe('Sent to 2 · 1 replied'); // only recipient_responded counts, "reading" does not
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

  it('canvas titles read underscores as spaces', () => {
    expect(buildArtifacts(source({ myCanvases: [myCanvas({ name: 'sales_map' })] })).yours[0]?.title).toBe('sales map');
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

  it('sent letter: Copy public link only on public letters; Delete blocked by any delivery', () => {
    const priv = menu({ sentLetters: [letter()] });
    expect(priv.map(a => a.id)).toEqual(['preview-letter', 'add-recipients', 'delete-letter']);
    expect(priv.at(-1)?.disabledReason).toBeUndefined();
    const pub = menu({ sentLetters: [letter({ mode: 'one-to-many' })], deliveriesByLetter: { l1: [delivery({ receiver_email: null })] } });
    expect(pub.map(a => a.id)).toEqual(['preview-letter', 'add-recipients', 'copy-public-link', 'delete-letter']);
    expect(pub.at(-1)?.disabledReason).toBe("Can't delete — letter has been shared.");
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
    expect(filterByQuery(yours, '  REVIEW ').map(r => r.title).sort()).toEqual(['Quarterly Review', 'review board']);
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
