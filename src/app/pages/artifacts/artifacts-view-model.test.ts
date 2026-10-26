import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  agoPhrase,
  buildArtifacts,
  canvasMeta,
  draftMeta,
  filterByQuery,
  listHasDot,
  resolveArtifactsLocation,
  tabHasDot,
  receivedInboxItems,
  receivedLetterMeta,
  repliedCountByLetter,
  senderActivityItems,
  sentMeta,
  sharedMeta,
  type ArtifactList,
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

  it('names in the meta line are first names only, so the line stays on one row', () => {
    expect(sentMeta({ isPublic: false, recipientCount: 3, doneCount: 1, newCount: 1, newFrom: ['Tom'], sealedAt: ago(H) }))
      .toBe('Sent to 3 · 1 new from Tom · 1h ago');
    expect(receivedLetterMeta(inboxItem({ actor_name: 'Vyacheslav Ladischenski', steps_completed: 2, total_steps: 5, timestamp: ago(4 * D) })))
      .toBe('From Vyacheslav · 2 of 5 steps · 4d ago');
    expect(receivedLetterMeta(inboxItem({ actor_name: '  Anna   Maria Lopez ', timestamp: ago(4 * D) }))).toBe('From Anna · 4d ago');
    expect(sharedMeta('Mara Jones', ago(H))).toBe('From Mara · 1h ago');
    // no usable name: the fallback stays "someone"
    expect(receivedLetterMeta(inboxItem({ actor_name: '   ', timestamp: ago(4 * D) }))).toBe('From someone · 4d ago');
    expect(sharedMeta('', ago(H))).toBe('From someone · 1h ago');
  });

  it('a sent letter\'s "N new from" uses the recipient\'s first name; two people sharing a first name are still 2 people', () => {
    const one = buildArtifacts(source({
      sentLetters: [letter({ sealed_at: ago(H) })],
      deliveriesByLetter: { l1: [delivery({ id: 'dv1', receiver_name: 'Vyacheslav Ladischenski' })] },
      newByDelivery: { dv1: 1 },
    }));
    expect(one.sent[0]?.meta).toBe('Sent to 1 · 1 new from Vyacheslav · 1h ago');
    const two = buildArtifacts(source({
      sentLetters: [letter({ sealed_at: ago(H) })],
      deliveriesByLetter: { l1: [delivery({ id: 'dv1', receiver_name: 'Tom Ash' }), delivery({ id: 'dv2', receiver_name: 'Tom Birch' })] },
      newByDelivery: { dv1: 1, dv2: 1 },
    }));
    expect(two.sent[0]?.meta).toBe('Sent to 2 · 2 new from 2 people · 1h ago');
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
    const lists = buildArtifacts(source({
      docs: [doc()],
      sentLetters: [letter()],
      deliveriesByLetter: { l1: [delivery({ status: 'completed' })] },
      myCanvases: [myCanvas()],
      inbox: [inboxItem()],
      sharedCanvases: [sharedCanvas()],
    }));
    for (const r of Object.values(lists).flat()) expect(r.meta).not.toMatch(/Sealed|recipients completed|replied/i);
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

  it('sender-side activity never appears in Received', () => {
    const { received: rows } = buildArtifacts(source({ inbox: [received, sender, progress, link] }));
    expect(rows.map(r => r.ref.deliveryId)).toEqual(['rd1']);
  });

  it('sender-side activity joins onto the sent letter\'s "N of M done"', () => {
    const { sent } = buildArtifacts(source({
      sentLetters: [letter()],
      deliveriesByLetter: { l1: [delivery({ id: 'sd1' }), delivery({ id: 'x2' })] }, // deliveries lag: none completed yet
      // Read items: unread sender activity now counts as "new" (own tests below); this one pins the done join.
      inbox: [{ ...sender, read_at: ago(H) }, { ...progress, read_at: ago(H) }],
    }));
    expect(sent[0]?.meta).toBe('Sent to 2 · 1 of 2 done · 1d ago'); // only recipient_responded counts, "reading" does not
  });

  it('replied counts a delivery once when deliveries and inbox both report it', () => {
    const counts = repliedCountByLetter(
      { l1: [delivery({ id: 'sd1', status: 'completed' }), delivery({ id: 'sd9', status: 'in_progress' })] },
      [sender, link],
    );
    expect(counts).toEqual({ l1: 2 }); // sd1 (both sources) + sd3 (inbox link respondent)
  });

  it('inbox activity never lights the Received dot', () => {
    const { received: rows } = buildArtifacts(source({ inbox: [sender, progress, link] }));
    expect(listHasDot('received', rows)).toBe(false);
  });
});

describe('rows', () => {
  it('counts distinct deliveries, not names: two Toms are 2 people', () => {
    const { sent } = buildArtifacts(source({
      sentLetters: [letter({ sealed_at: ago(H) })],
      deliveriesByLetter: { l1: [delivery({ id: 'dv1', receiver_name: 'Tom' }), delivery({ id: 'dv2', receiver_name: 'Tom' })] },
      newByDelivery: { dv1: 1, dv2: 1 },
    }));
    expect(sent[0]?.meta).toBe('Sent to 2 · 2 new from 2 people · 1h ago');
  });

  it('one delivery with no name reads "from someone"', () => {
    const { sent } = buildArtifacts(source({
      sentLetters: [letter({ sealed_at: ago(H) })],
      deliveriesByLetter: { l1: [delivery({ id: 'dv1', receiver_name: null })] },
      newByDelivery: { dv1: 1 },
    }));
    expect(sent[0]?.meta).toBe('Sent to 1 · 1 new from someone · 1h ago');
  });

  it('an unread recipient_responded activity item is new, and its time replaces sealed_at in text and sort', () => {
    const responded = inboxItem({ type: 'recipient_responded', delivery_id: 'dv1', letter_id: 'l1', actor_name: 'Tom', timestamp: ago(10 * 60_000), read_at: null, completed_at: ago(10 * 60_000) });
    const { sent } = buildArtifacts(source({
      docs: [doc({ updated_at: ago(2 * H) })],
      sentLetters: [letter({ sealed_at: ago(3 * D) })],
      deliveriesByLetter: { l1: [delivery({ id: 'dv1', receiver_name: 'Tom', status: 'completed' })] },
      inbox: [responded],
    }));
    expect(sent[0]?.state).toBe('sent');
    expect(sent[0]?.meta).toBe('Sent to 1 · 1 new from Tom · 10m ago');
  });

  it('a read activity item is not new', () => {
    const responded = inboxItem({ type: 'recipient_responded', delivery_id: 'dv1', letter_id: 'l1', read_at: ago(H) });
    const { sent } = buildArtifacts(source({
      sentLetters: [letter({ sealed_at: ago(3 * D) })],
      deliveriesByLetter: { l1: [delivery({ id: 'dv1', status: 'completed' })] },
      inbox: [responded],
    }));
    expect(sent[0]?.meta).toBe('Sent to 1 · 1 of 1 done · 3d ago');
  });

  it('activity and explain-backs on one delivery are not double counted', () => {
    const responded = inboxItem({ type: 'recipient_responded', delivery_id: 'dv1', letter_id: 'l1', read_at: null, timestamp: ago(H) });
    const { sent } = buildArtifacts(source({
      sentLetters: [letter({ sealed_at: ago(3 * D) })],
      deliveriesByLetter: { l1: [delivery({ id: 'dv1', receiver_name: 'Tom', status: 'completed' })] },
      inbox: [responded],
      newByDelivery: { dv1: 2 },
    }));
    expect(sent[0]?.meta).toBe('Sent to 1 · 2 new from Tom · 1h ago');
  });

  it('rows carry no "…" menu: a tap opens the item and the actions live inside it', () => {
    const lists = buildArtifacts(source({
      docs: [doc()],
      sentLetters: [letter()],
      myCanvases: [myCanvas()],
      inbox: [inboxItem()],
      sharedCanvases: [sharedCanvas()],
    }));
    const rows = Object.values(lists).flat();
    expect(rows).toHaveLength(5);
    for (const r of rows) expect(r).not.toHaveProperty('menu');
  });

  it('new explain-backs show as "N new from <name>" on the sent letter', () => {
    const { sent } = buildArtifacts(source({
      sentLetters: [letter({ sealed_at: ago(H) })],
      deliveriesByLetter: { l1: [delivery({ id: 'dv1', receiver_name: 'Tom' }), delivery({ id: 'dv2', receiver_name: 'Ann' })] },
      newByDelivery: { dv1: 1 },
    }));
    expect(sent[0]?.meta).toBe('Sent to 2 · 1 new from Tom · 1h ago');
  });

  it('a draft counts the letters sent from it', () => {
    const { drafts } = buildArtifacts(source({
      docs: [doc({ id: 'd9', story_count: 3, point_count: 5, has_sent_letters: true })],
      sentLetters: [letter({ id: 'l1' }), letter({ id: 'l2' })],
    }));
    expect(drafts[0]?.meta).toBe('Draft · 3 stories, 5 points · used for 2 letters');
  });

  it('each kind lands in its own list, newest first inside it', () => {
    const lists = buildArtifacts(source({
      docs: [doc({ id: 'dA', title: 'Older draft', updated_at: ago(5 * D) }), doc({ id: 'dB', title: 'Newer draft', updated_at: ago(H) })],
      sentLetters: [letter({ id: 'l1', doc_title: 'Sent letter', sealed_at: ago(2 * H) })],
      myCanvases: [myCanvas({ name: 'review_board', lastEdit: ago(30 * 60_000) }), myCanvas({ name: 'older_one', lastEdit: ago(3 * D) })],
      inbox: [inboxItem({ delivery_id: 'rA', title: 'Old', timestamp: ago(3 * D) }), inboxItem({ delivery_id: 'rB', title: 'New', timestamp: ago(H) })],
      sharedCanvases: [sharedCanvas({ canvasId: 'c1', sharedAt: ago(D) }), sharedCanvas({ canvasId: 'c2', name: 'newer_shared', sharedAt: ago(H) })],
    }));
    expect(lists.drafts.map(r => r.title)).toEqual(['Newer draft', 'Older draft']);
    expect(lists.sent.map(r => r.title)).toEqual(['Sent letter']);
    expect(lists.received.map(r => r.title)).toEqual(['New', 'Old']);
    expect(lists.mine.map(r => r.title)).toEqual(['Review board', 'Older one']);
    expect(lists.shared.map(r => r.title)).toEqual(['Newer shared', 'Q4 plan']);
    for (const list of Object.keys(lists) as ArtifactList[]) {
      expect(lists[list].every(r => r.list === list)).toBe(true);
    }
  });

  it('a draft that was already sent stays in Drafts; a public-link letter is in Sent', () => {
    const lists = buildArtifacts(source({
      docs: [doc({ id: 'd9', title: 'Already sent', has_sent_letters: true })],
      sentLetters: [letter({ id: 'l2', source_doc_id: 'd9', doc_title: 'Public one', mode: 'one-to-many' })],
    }));
    expect(lists.drafts.map(r => r.title)).toEqual(['Already sent']);
    expect(lists.sent.map(r => r.title)).toEqual(['Public one']);
  });

  it('own items carry a visibility icon, received items none; unread only on received items', () => {
    const lists = buildArtifacts(source({
      docs: [doc({ visibility: 'public' })],
      sentLetters: [letter({ mode: 'one-to-many' })],
      myCanvases: [myCanvas({ generalAccess: 'link' }), myCanvas({ name: 'private_one' })],
      inbox: [inboxItem()],
      sharedCanvases: [sharedCanvas()],
    }));
    const own = [...lists.drafts, ...lists.sent, ...lists.mine];
    const incoming = [...lists.received, ...lists.shared];
    expect(own.map(r => r.visibility)).toEqual(expect.arrayContaining(['public', 'private']));
    expect(own.every(r => r.visibility !== null && r.unread === false)).toBe(true);
    expect(lists.mine.find(r => r.ref.canvasName === 'sales_map')?.visibility).toBe('public');
    expect(incoming.every(r => r.visibility === null)).toBe(true);
    expect(incoming.every(r => r.unread)).toBe(true);
  });

  it('row tap targets are the items\' existing pages: a draft edits, a sent letter opens its overview', () => {
    const lists = buildArtifacts(source({
      docs: [doc()],
      sentLetters: [letter()],
      myCanvases: [myCanvas()],
      inbox: [inboxItem(), inboxItem({ delivery_id: 'rd2', letter_id: 'rl2', completed_at: ago(H), read_at: ago(H) })],
      sharedCanvases: [sharedCanvas()],
    }));
    const hrefs = Object.fromEntries(Object.values(lists).flat().map(r => [r.key, r.href]));
    expect(hrefs['draft:d1']).toBe('/letters/drafts/d1');
    expect(hrefs['sent:l1']).toBe('/letter/l1/overview');
    expect(hrefs['canvas:sales_map']).toBe('/p/me/canvas/sales_map');
    expect(hrefs['received:rd1']).toBe('/letter/rd1');
    expect(hrefs['received:rd2']).toBe('/letter/rl2/results?delivery=rd2');
    expect(hrefs['shared-canvas:c1']).toBe('/p/tom/canvas/q4_plan');
  });

  it('a canvas address cannot be built without a handle', () => {
    expect(buildArtifacts(source({ myCanvases: [myCanvas()], userSlug: null })).mine[0]?.href).toBeNull();
    expect(buildArtifacts(source({ sharedCanvases: [sharedCanvas({ ownerSlug: null })] })).shared[0]?.href).toBeNull();
  });

  it('canvas titles read underscores as spaces and start with a capital', () => {
    expect(buildArtifacts(source({ myCanvases: [myCanvas({ name: 'sales_map' })] })).mine[0]?.title).toBe('Sales map');
  });
});

describe('search', () => {
  const { drafts } = buildArtifacts(source({
    docs: [doc({ id: 'a', title: 'Quarterly Review' }), doc({ id: 'b', title: 'Review notes' }), doc({ id: 'c', title: 'Other' })],
  }));

  it('search is a case-insensitive title match, trimmed', () => {
    expect(filterByQuery(drafts, '  REVIEW ').map(r => r.title).sort()).toEqual(['Quarterly Review', 'Review notes']);
    expect(filterByQuery(drafts, '')).toHaveLength(3);
    expect(filterByQuery(drafts, 'nothing like it')).toEqual([]);
  });

  it('search matches titles only, not the meta line', () => {
    expect(filterByQuery(drafts, 'draft')).toEqual([]);
  });
});

describe('dots (Received and Shared with me while unread, Sent while new, tab when a list has one)', () => {
  const unreadReceived = inboxItem();
  const readReceived = inboxItem({ delivery_id: 'rd2', read_at: ago(H) });
  const newSent = {
    sentLetters: [letter({ sealed_at: ago(H) })],
    deliveriesByLetter: { l1: [delivery({ id: 'dv1', receiver_name: 'Tom' })] },
    newByDelivery: { dv1: 1 },
  };

  it('Received and Shared with me carry a dot while any row is unread, and not when all are read', () => {
    const unread = buildArtifacts(source({ inbox: [unreadReceived, readReceived], sharedCanvases: [sharedCanvas()] }));
    expect(listHasDot('received', unread.received)).toBe(true);
    expect(listHasDot('shared', unread.shared)).toBe(true);
    const read = buildArtifacts(source({ inbox: [readReceived], sharedCanvases: [sharedCanvas({ unread: false })] }));
    expect(listHasDot('received', read.received)).toBe(false);
    expect(listHasDot('shared', read.shared)).toBe(false);
  });

  it('items opened on the page stop counting at once', () => {
    const { received } = buildArtifacts(source({ inbox: [unreadReceived, readReceived] }));
    expect(listHasDot('received', received, new Set(['received:rd1']))).toBe(false);
  });

  it('Sent carries a dot while any sent letter has something new; the row says it in words', () => {
    const withNew = buildArtifacts(source(newSent));
    expect(withNew.sent[0]?.meta).toBe('Sent to 1 · 1 new from Tom · 1h ago');
    expect(withNew.sent[0]?.unread).toBe(false); // the row itself never gets the unread dot
    expect(listHasDot('sent', withNew.sent)).toBe(true);
    const quiet = buildArtifacts(source({ ...newSent, newByDelivery: {} }));
    expect(listHasDot('sent', quiet.sent)).toBe(false);
  });

  it('Drafts, Mine never carry a dot', () => {
    const lists = buildArtifacts(source({ docs: [doc()], myCanvases: [myCanvas()] }));
    expect(listHasDot('drafts', lists.drafts)).toBe(false);
    expect(listHasDot('mine', lists.mine)).toBe(false);
  });

  it('a tab carries a dot when one of its lists does', () => {
    const letters = buildArtifacts(source({ inbox: [unreadReceived] }));
    expect(tabHasDot('letters', letters)).toBe(true);
    expect(tabHasDot('canvases', letters)).toBe(false);
    const canvases = buildArtifacts(source({ sharedCanvases: [sharedCanvas()] }));
    expect(tabHasDot('canvases', canvases)).toBe(true);
    expect(tabHasDot('letters', canvases)).toBe(false);
    const viaSent = buildArtifacts(source(newSent));
    expect(tabHasDot('letters', viaSent)).toBe(true);
    // the opened override reaches the tab too
    expect(tabHasDot('letters', letters, new Set(['received:rd1']))).toBe(false);
    expect(tabHasDot('letters', buildArtifacts(source()))).toBe(false);
  });
});

describe('url state', () => {
  const loc = (qs: string) => resolveArtifactsLocation(new URLSearchParams(qs));

  it('tab defaults to letters and the list to the tab\'s first; junk falls back', () => {
    expect(loc('')).toMatchObject({ tab: 'letters', list: 'drafts', legacy: false });
    expect(loc('tab=letters&list=sent')).toMatchObject({ tab: 'letters', list: 'sent', legacy: false });
    expect(loc('tab=letters&list=received')).toMatchObject({ tab: 'letters', list: 'received' });
    expect(loc('tab=canvases')).toMatchObject({ tab: 'canvases', list: 'mine' });
    expect(loc('tab=canvases&list=shared')).toMatchObject({ tab: 'canvases', list: 'shared' });
    // a list that belongs to the other tab, or junk, falls back to the tab's default
    expect(loc('tab=letters&list=mine')).toMatchObject({ tab: 'letters', list: 'drafts' });
    expect(loc('tab=canvases&list=drafts')).toMatchObject({ tab: 'canvases', list: 'mine' });
    expect(loc('tab=nonsense&list=toString')).toMatchObject({ tab: 'letters', list: 'drafts', legacy: false });
  });

  it.each([
    ['tab=yours', 'letters', 'drafts'],
    ['tab=yours&type=letters', 'letters', 'drafts'],
    ['tab=yours&type=all', 'letters', 'drafts'],
    ['tab=yours&type=canvases', 'canvases', 'mine'],
    ['tab=shared', 'letters', 'received'],
    ['tab=shared&type=letters', 'letters', 'received'],
    ['tab=shared&type=canvases', 'canvases', 'shared'],
    ['type=canvases', 'canvases', 'mine'],
    ['type=letters', 'letters', 'drafts'],
  ])('old link ?%s opens %s / %s and is flagged for a history-replacing rewrite', (qs, tab, list) => {
    const r = loc(qs);
    expect(r).toMatchObject({ tab, list, legacy: true });
    expect(r.canonical.get('tab')).toBe(tab);
    expect(r.canonical.get('list')).toBe(list);
    expect(r.canonical.has('type')).toBe(false);
  });

  it('the rewrite keeps unrelated params', () => {
    expect(loc('tab=shared&type=canvases&x=1').canonical.get('x')).toBe('1');
  });

  it('a stray type on a new-style link is ignored, not rewritten', () => {
    expect(loc('tab=canvases&type=letters')).toMatchObject({ tab: 'canvases', list: 'mine', legacy: false });
  });
});
