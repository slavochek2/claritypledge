/**
 * @file p1545-artifacts-data.test.ts
 * @description P1545 WP1 on the live TEST project (migration 20261023100000): the Artifacts data layer.
 *
 * Actors: owner O, person P (O's witness, same group), stranger X (same group, NO grant), letter
 * recipient Q (same group, O's witness), event host H, and Z (a member of an otherwise empty group).
 *
 * Every refusal has a control that shows the same call succeeding for the case that must succeed.
 * Every row is created by this run and removed in afterAll.
 *
 * Run: npx vitest run --config src/tests/integration/vitest.config.ts src/tests/integration/p1545-artifacts-data.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import { supabaseAdmin } from '../../../e2e/helpers/supabase-admin';
import { createTestUser, deleteTestUser, type TestUser } from '../../../e2e/helpers/test-user';
import { createTestOrganization, createTestMembership, deleteTestOrganization, type TestOrganization } from '../../../e2e/helpers/test-organization';
import { createTestEvent, deleteTestEvent, type TestEvent } from '../../../e2e/helpers/test-event';
import { createTestDoc, createTestLetter } from '../../../e2e/helpers/test-letter';
import { signIn, purgeChatFor } from '../../../e2e/helpers/test-chat';
import { hasNewSenderProgress } from '../../app/utils/letter-new-activity';

 
type Row = Record<string, any>;

const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
const TAG = `p1545d${RUN}`;
const NAME = `p1545d${RUN}`.toLowerCase();
const NAME2 = `${NAME}b`;
const HOUR = 3_600_000;

const users: TestUser[] = [];
const events: TestEvent[] = [];
const orgs: TestOrganization[] = [];
const pointIds: string[] = [];
const letterIds: string[] = [];
const docIds: string[] = [];

let O: TestUser, P: TestUser, X: TestUser, Q: TestUser, H: TestUser, Z: TestUser;
let cO: SupabaseClient, cP: SupabaseClient, cX: SupabaseClient, cQ: SupabaseClient, cZ: SupabaseClient;
let G: TestOrganization, G2: TestOrganization;
let canvasId: string;

async function mkUser(label: string): Promise<TestUser> {
  const u = await createTestUser({ name: `P1545 ${label} ${RUN}` });
  users.push(u);
  return u;
}
async function mkPoint(owner: string, label: string, canvas: string): Promise<void> {
  const { data, error } = await supabaseAdmin.from('points').insert({
    statement: `${TAG} ${label}`, first_validator_id: owner, visibility: 'private', tags: [TAG],
    system_tags: [`canvas_${canvas}`, 'canvas:problem'],
  }).select('id').single();
  if (error) throw new Error(`mkPoint ${label}: ${error.message}`);
  pointIds.push(data.id);
}
async function ok<T = any>(c: SupabaseClient, fn: string, args: Record<string, unknown> | undefined, what: string): Promise<T> {
  const { data, error } = await c.rpc(fn, args);
  if (error) throw new Error(`${what}: ${fn} failed: ${error.message}`);
  return data as T;
}
const dmOf = async (a: string, b: string): Promise<string | null> => {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  const { data } = await supabaseAdmin.from('chat_conversations').select('id').eq('kind', 'dm').eq('dm_user_a', lo).eq('dm_user_b', hi);
  return data?.[0]?.id ?? null;
};
const artifactMessages = async (conv: string | null, kind: string, id?: string): Promise<Row[]> => {
  if (!conv) return [];
  let q = supabaseAdmin.from('chat_messages').select('id, author_id, body, attachment_kind, attachment_id').eq('conversation_id', conv).eq('attachment_kind', kind);
  if (id) q = q.eq('attachment_id', id);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
};
const groupConv = async (orgId: string): Promise<string | null> => {
  const { data } = await supabaseAdmin.from('chat_conversations').select('id').eq('kind', 'group').eq('org_id', orgId);
  return data?.[0]?.id ?? null;
};
const myChat = async (c: SupabaseClient, pick: (r: Row) => boolean): Promise<Row | undefined> =>
  (await ok<Row[]>(c, 'get_my_chats', undefined, 'get_my_chats')).find(pick);
const send = (c: SupabaseClient, conv: string, kind: string, id: string) =>
  c.rpc('send_chat_message', { p_conversation: conv, p_body: null, p_attachment_kind: kind, p_attachment_id: id });

beforeAll(async () => {
  O = await mkUser('O'); P = await mkUser('P'); X = await mkUser('X'); Q = await mkUser('Q'); H = await mkUser('H'); Z = await mkUser('Z');
  cO = (await signIn(O)).client; cP = (await signIn(P)).client; cX = (await signIn(X)).client;
  cQ = (await signIn(Q)).client; cZ = (await signIn(Z)).client;

  G = await createTestOrganization({ name: `P1545 group ${RUN}`, visibility: 'public' }); orgs.push(G);
  G2 = await createTestOrganization({ name: `P1545 empty group ${RUN}`, visibility: 'public' }); orgs.push(G2);
  for (const u of [O, P, X, Q]) await createTestMembership(G.id, u.user.id);
  await createTestMembership(G2.id, Z.user.id);

  await mkPoint(O.user.id, 'first', NAME);
  await mkPoint(O.user.id, 'second', NAME2);
  // P and Q witnessed O: the relationship the share / letter person-eligibility is scoped to.
  for (const w of [P, Q]) {
    const r = await supabaseAdmin.from('witnesses').insert({ profile_id: O.user.id, witness_name: `P1545 w ${RUN}`, witness_profile_id: w.user.id });
    if (r.error) throw new Error(`witness: ${r.error.message}`);
  }
}, 300_000);

afterAll(async () => {
  const uid = users.map(u => u.user.id);
  const convs: string[] = [];
  for (const o of orgs) { const c = await groupConv(o.id); if (c) convs.push(c); }
  for (const e of events) {
    const { data } = await supabaseAdmin.from('chat_conversations').select('id').eq('kind', 'event').eq('event_id', e.id);
    for (const r of data ?? []) convs.push(r.id);
  }
  await purgeChatFor(uid, convs);
  if (O) await supabaseAdmin.from('canvases').delete().eq('owner_id', O.user.id);
  if (pointIds.length) await supabaseAdmin.from('points').delete().in('id', pointIds);
  if (O) await supabaseAdmin.from('witnesses').delete().eq('profile_id', O.user.id);
  for (const id of letterIds) await supabaseAdmin.from('clarity_letters').delete().eq('id', id);
  for (const id of docIds) await supabaseAdmin.from('clarity_docs').delete().eq('id', id);
  for (const e of events) await deleteTestEvent(e.id);
  for (const o of orgs) await deleteTestOrganization(o.id);
  for (const u of users) await deleteTestUser(u.user.id);
}, 300_000);

describe('P1545 WP1: my canvases', () => {
  it('lists a canvas that has points but no row yet as private, with no audience', async () => {
    const rows = await ok<Row[]>(cO, 'list_my_artifacts_canvases', undefined, 'my canvases');
    const mine = rows.find(r => r.name === NAME);
    expect(mine, 'tagged canvas listed').toBeDefined();
    expect(mine!.canvas_id).toBeNull();
    expect(mine!.general_access).toBe('restricted');
    expect(mine!.has_audience).toBe(false);
    expect(mine!.last_edit).toBeTruthy();
  });

  it("never lists another person's canvas", async () => {
    const rows = await ok<Row[]>(cP, 'list_my_artifacts_canvases', undefined, 'P canvases');
    expect(rows.find(r => r.name === NAME)).toBeUndefined();
  });
});

describe('P1545 WP1: sharing a canvas with a person', () => {
  it('posts exactly one attachment message in the 1:1 on a new grant, none on a re-share', async () => {
    expect(await dmOf(O.user.id, P.user.id), 'no 1:1 yet').toBeNull();
    await ok(cO, 'share_canvas', { p_name: NAME, p_kind: 'person', p_target: P.user.id }, 'share with P');
    const { data: c } = await supabaseAdmin.from('canvases').select('id').eq('owner_id', O.user.id).eq('name', NAME).single();
    canvasId = c!.id;
    const dm = await dmOf(O.user.id, P.user.id);
    expect(dm, '1:1 created by the share').not.toBeNull();
    const msgs = await artifactMessages(dm, 'canvas', canvasId);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]?.author_id).toBe(O.user.id);
    expect(msgs[0]?.body).toBeNull();

    await ok(cO, 'share_canvas', { p_name: NAME, p_kind: 'person', p_target: P.user.id }, 're-share with P');
    expect(await artifactMessages(dm, 'canvas', canvasId), 're-share posts nothing').toHaveLength(1);
  });

  it('the owner now sees a row id, an audience and the stored general access', async () => {
    const mine = (await ok<Row[]>(cO, 'list_my_artifacts_canvases', undefined, 'my canvases')).find(r => r.name === NAME)!;
    expect(mine.canvas_id).toBe(canvasId);
    expect(mine.has_audience).toBe(true);
    expect(mine.general_access).toBe('restricted');
  });

  it('appears in P\'s Shared with me, unread, with the owner and the grant; opening it clears the marker', async () => {
    const row = (await ok<Row[]>(cP, 'list_canvases_shared_with_me', undefined, 'P shared')).find(r => r.canvas_id === canvasId);
    expect(row, 'listed').toBeDefined();
    expect(row!.owner_id).toBe(O.user.id);
    expect(row!.owner_name).toContain('P1545 O');
    expect(row!.via).toBe('person');
    expect(row!.unread).toBe(true);
    expect(new Date(row!.shared_at).getTime()).toBeGreaterThan(Date.now() - 10 * 60_000);

    await ok(cP, 'mark_canvas_read', { p_owner: O.user.id, p_name: NAME }, 'P opens');
    const after = (await ok<Row[]>(cP, 'list_canvases_shared_with_me', undefined, 'P shared')).find(r => r.canvas_id === canvasId);
    expect(after!.unread).toBe(false);
  });

  it('the owner and a stranger do not list it; mark_canvas_read is a silent no-op for them', async () => {
    expect((await ok<Row[]>(cO, 'list_canvases_shared_with_me', undefined, 'O shared')).find(r => r.canvas_id === canvasId)).toBeUndefined();
    expect((await ok<Row[]>(cX, 'list_canvases_shared_with_me', undefined, 'X shared')).find(r => r.canvas_id === canvasId)).toBeUndefined();
    await ok(cX, 'mark_canvas_read', { p_owner: O.user.id, p_name: NAME }, 'X marks');
    await ok(cO, 'mark_canvas_read', { p_owner: O.user.id, p_name: NAME }, 'O marks');
    const { data } = await supabaseAdmin.from('canvas_reads').select('user_id').eq('canvas_id', canvasId);
    expect((data ?? []).map(r => r.user_id)).toEqual([P.user.id]);
  });

  it('a canvas open only by link is in nobody\'s Shared with me, and the owner sees general access link', async () => {
    await ok(cO, 'set_canvas_general_access', { p_name: NAME2, p_access: 'link' }, 'open NAME2 by link');
    const { data: c2 } = await supabaseAdmin.from('canvases').select('id').eq('owner_id', O.user.id).eq('name', NAME2).single();
    for (const [who, c] of [['P', cP], ['X', cX], ['Q', cQ]] as const) {
      const rows = await ok<Row[]>(c, 'list_canvases_shared_with_me', undefined, `${who} shared`);
      expect(rows.find(r => r.canvas_id === c2!.id), `${who}: link-only canvas absent`).toBeUndefined();
    }
    const mine = (await ok<Row[]>(cO, 'list_my_artifacts_canvases', undefined, 'my canvases')).find(r => r.name === NAME2)!;
    expect(mine.general_access).toBe('link');
  });

  it('the shared-with-me list and the mark_canvas_read table are closed to direct client access', async () => {
    const t = await cP.from('canvas_reads').select('*');
    expect(t.error !== null || (t.data ?? []).length === 0, 'canvas_reads unreadable').toBe(true);
  });
});

describe('P1545 WP1: attachment rules (_chat_can_attach via send_chat_message)', () => {
  it('the audience can already read it: allowed to the person with a grant', async () => {
    const dm = (await dmOf(O.user.id, P.user.id))!;
    const r = await send(cO, dm, 'canvas', canvasId);
    expect(r.error, 'control: O -> P allowed').toBeNull();
    // the reader P may send it back to the owner, who can obviously read it
    expect((await send(cP, dm, 'canvas', canvasId)).error, 'P -> O allowed').toBeNull();
  });

  it('refused when the other member has no grant (never widens access)', async () => {
    const dmOX = await ok<string>(cO, 'start_dm', { p_other: X.user.id }, 'O starts 1:1 with X');
    const e1 = await send(cO, dmOX, 'canvas', canvasId);
    expect(e1.error?.message).toMatch(/attachment not available/);
    const dmPX = await ok<string>(cP, 'start_dm', { p_other: X.user.id }, 'P starts 1:1 with X');
    const e2 = await send(cP, dmPX, 'canvas', canvasId);
    expect(e2.error?.message, 'a reader cannot forward it to somebody without a grant').toMatch(/attachment not available/);
  });

  it('refused in a channel whose group has no grant, allowed once it has one', async () => {
    const { data: g } = await supabaseAdmin.from('chat_conversations').select('id').eq('kind', 'group').eq('org_id', G.id);
    let gc = g?.[0]?.id as string | undefined;
    if (!gc) { await ok(cO, 'get_my_chats', undefined, 'ensure group chat'); gc = (await groupConv(G.id))!; }
    const before = await send(cO, gc, 'canvas', canvasId);
    expect(before.error?.message).toMatch(/attachment not available/);
    await ok(cO, 'share_canvas', { p_name: NAME, p_kind: 'group', p_target: G.id }, 'share with group');
    expect(await artifactMessages(gc, 'canvas', canvasId), 'the new group grant posted exactly one message').toHaveLength(1);
    expect((await send(cO, gc, 'canvas', canvasId)).error, 'control: allowed once the group has a grant').toBeNull();
  });

  it('an unknown kind is refused', async () => {
    const dm = (await dmOf(O.user.id, P.user.id))!;
    const r = await send(cO, dm, 'folder', canvasId);
    expect(r.error?.message).toMatch(/unknown attachment kind/);
  });

  it('a canvas id that does not exist is refused with the same message as one you cannot see', async () => {
    const dm = (await dmOf(O.user.id, P.user.id))!;
    const r = await send(cO, dm, 'canvas', '00000000-0000-4000-8000-000000000000');
    expect(r.error?.message).toMatch(/attachment not available/);
  });
});

describe('P1545 WP1: sharing with a group posts into its channel', () => {
  it('a re-share of the group grant posts nothing more in the channel', async () => {
    const gc = (await groupConv(G.id))!;
    // the share posted 1, the explicit send in the previous describe added 1 more
    const n = (await artifactMessages(gc, 'canvas', canvasId)).length;
    expect(n).toBe(2);
    await ok(cO, 'share_canvas', { p_name: NAME, p_kind: 'group', p_target: G.id }, 're-share with group');
    expect(await artifactMessages(gc, 'canvas', canvasId), 're-share posts nothing').toHaveLength(n);
  });

  it('a group member sees it in Shared with me via the group, with the group name', async () => {
    const row = (await ok<Row[]>(cX, 'list_canvases_shared_with_me', undefined, 'X shared')).find(r => r.canvas_id === canvasId);
    expect(row).toBeDefined();
    expect(row!.via).toBe('group');
    expect(row!.via_name).toContain('P1545 group');
    expect(row!.unread).toBe(true);
  });
});

describe('P1545 WP1: the chat card is judged for the viewer; revoked and deleted come back unavailable', () => {
  it('available for the owner, for P and for a group member; carries the name and owner', async () => {
    for (const [who, c] of [['O', cO], ['P', cP], ['X', cX]] as const) {
      const a = await ok<Row>(c, 'get_chat_artifact_attachment', { p_kind: 'canvas', p_id: canvasId }, `${who} card`);
      expect(a.available, `${who}: available`).toBe(true);
      expect(a.name).toBe(NAME);
      expect(a.owner_id).toBe(O.user.id);
    }
  });

  it('unavailable (and nothing else) for somebody the canvas was never shared with', async () => {
    // Z is in no group O shares with and holds no grant (Q and X are in the shared group)
    const a = await ok<Row>(cZ, 'get_chat_artifact_attachment', { p_kind: 'canvas', p_id: canvasId }, 'Z card');
    expect(a).toEqual({ available: false, kind: 'canvas', id: canvasId });
  });

  it('after the person grant is revoked the message stays and the card is unavailable for P', async () => {
    const dm = (await dmOf(O.user.id, P.user.id))!;
    const n = (await artifactMessages(dm, 'canvas', canvasId)).length;
    // P is also in group G which holds a grant, so revoke that too: P must have NO path left
    await ok(cO, 'unshare_canvas', { p_name: NAME, p_kind: 'person', p_target: P.user.id }, 'revoke person');
    const stillViaGroup = await ok<Row>(cP, 'get_chat_artifact_attachment', { p_kind: 'canvas', p_id: canvasId }, 'P card (group grant)');
    expect(stillViaGroup.available, 'control: still readable through the group grant').toBe(true);
    await ok(cO, 'unshare_canvas', { p_name: NAME, p_kind: 'group', p_target: G.id }, 'revoke group');
    const gone = await ok<Row>(cP, 'get_chat_artifact_attachment', { p_kind: 'canvas', p_id: canvasId }, 'P card (revoked)');
    expect(gone.available).toBe(false);
    expect(await artifactMessages(dm, 'canvas', canvasId), 'messages stay').toHaveLength(n);
    expect((await ok<Row[]>(cP, 'list_canvases_shared_with_me', undefined, 'P shared')).find(r => r.canvas_id === canvasId)).toBeUndefined();
    const marker = await ok(cP, 'mark_canvas_read', { p_owner: O.user.id, p_name: NAME }, 'P marks after revoke');
    expect(marker ?? null).toBeNull();
  });

  it('a deleted canvas is unavailable even for its owner', async () => {
    await supabaseAdmin.from('canvases').delete().eq('id', canvasId);
    const a = await ok<Row>(cO, 'get_chat_artifact_attachment', { p_kind: 'canvas', p_id: canvasId }, 'O card (deleted)');
    expect(a.available).toBe(false);
  });
});

describe('P1545 WP1: letters post into the 1:1 for registered recipients only', () => {
  let letterId: string;

  it('seal posts one letter message to a registered recipient; the card is theirs and the sender\'s only', async () => {
    const doc = await createTestDoc(O.user.id, `P1545 letter ${RUN}`);
    docIds.push(doc.id);
    const letter = await createTestLetter(O.user.id, doc.id);
    letterId = letter.id;
    letterIds.push(letterId);
    await ok(cO, 'seal_and_send_letter', {
      p_letter_id: letterId, p_predictions: [],
      p_deliveries: [{ receiver_profile_id: P.user.id, receiver_name: 'P' }], p_responses_mode: 'invite',
    }, 'seal to P');
    const dm = (await dmOf(O.user.id, P.user.id))!;
    const msgs = await artifactMessages(dm, 'letter', letterId);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]?.author_id).toBe(O.user.id);

    const forP = await ok<Row>(cP, 'get_chat_artifact_attachment', { p_kind: 'letter', p_id: letterId }, 'P letter card');
    expect(forP.available).toBe(true);
    expect(forP.title).toBe(`P1545 letter ${RUN}`);
    expect(forP.is_sender).toBe(false);
    // /letter/:id takes a DELIVERY id: the card carries the viewer's own, never the letter's
    const { data: dP } = await supabaseAdmin.from('letter_deliveries').select('id').eq('letter_id', letterId).eq('receiver_profile_id', P.user.id);
    expect(dP).toHaveLength(1);
    expect(forP.delivery_id).toBe(dP![0]!.id);
    expect(forP.delivery_id).not.toBe(letterId);
    // received letters are paged without the mixed-list cap
    const page = await ok<Row[]>(cP, 'get_received_letters_page', { p_limit: 100, p_before_ts: null, p_before_id: null }, 'P received page');
    expect(page.map(r => r.delivery_id)).toContain(dP![0]!.id);
    expect(page.every(r => r.type === 'received')).toBe(true);
    const none = await ok<Row[]>(cX, 'get_received_letters_page', { p_limit: 100, p_before_ts: null, p_before_id: null }, 'X received page');
    expect(none.find(r => r.letter_id === letterId), 'control: a non-recipient lists nothing').toBeUndefined();
    const forO = await ok<Row>(cO, 'get_chat_artifact_attachment', { p_kind: 'letter', p_id: letterId }, 'O letter card');
    expect(forO.available && forO.is_sender).toBe(true);
    expect(forO.delivery_id, 'sender who is not a recipient has no delivery').toBeNull();
    const forX = await ok<Row>(cX, 'get_chat_artifact_attachment', { p_kind: 'letter', p_id: letterId }, 'X letter card');
    expect(forX).toEqual({ available: false, kind: 'letter', id: letterId });
  });

  it('adding a registered recipient posts into that 1:1; an unregistered email posts nothing', async () => {
    await ok(cO, 'add_recipient_to_sealed_letter', { p_letter_id: letterId, p_email: Q.email, p_receiver_name: 'Q' }, 'add Q');
    expect(await artifactMessages(await dmOf(O.user.id, Q.user.id), 'letter', letterId)).toHaveLength(1);

    const stranger = `p1545-nobody-${RUN}@example.com`;
    await ok(cO, 'add_recipient_to_sealed_letter', { p_letter_id: letterId, p_email: stranger, p_receiver_name: 'Nobody' }, 'add unregistered');
    const { data } = await supabaseAdmin.from('chat_messages').select('id, conversation_id').eq('attachment_kind', 'letter').eq('attachment_id', letterId);
    expect(data, 'one message per registered recipient, none for the email').toHaveLength(2);
  });

  it('a public-link (one-to-many) delivery for a registered respondent posts nothing', async () => {
    const doc = await createTestDoc(O.user.id, `P1545 public letter ${RUN}`);
    docIds.push(doc.id);
    const pub = await createTestLetter(O.user.id, doc.id, { mode: 'one-to-many' });
    letterIds.push(pub.id);
    const ins = await supabaseAdmin.from('letter_deliveries').insert({ letter_id: pub.id, receiver_profile_id: P.user.id });
    expect(ins.error).toBeNull();
    expect(await artifactMessages(await dmOf(O.user.id, P.user.id), 'letter', pub.id)).toHaveLength(0);
  });

  it('a letter attaches only in the 1:1 with one of its recipients (never a channel, never a non-recipient)', async () => {
    const dmOP = (await dmOf(O.user.id, P.user.id))!;
    expect((await send(cO, dmOP, 'letter', letterId)).error, 'control: recipient P allowed').toBeNull();
    const dmOX = await ok<string>(cO, 'start_dm', { p_other: X.user.id }, 'O 1:1 with X');
    expect((await send(cO, dmOX, 'letter', letterId)).error?.message, 'non-recipient').toMatch(/attachment not available/);
    const gc = (await groupConv(G.id))!;
    expect((await send(cO, gc, 'letter', letterId)).error?.message, 'channel').toMatch(/attachment not available/);
    // the recipient is not the sender: P cannot re-post O's letter
    expect((await send(cP, dmOP, 'letter', letterId)).error?.message, 'recipient is not the sender').toMatch(/attachment not available/);
  });

  it('a deleted letter is unavailable', async () => {
    await supabaseAdmin.from('clarity_letters').delete().eq('id', letterId);
    const a = await ok<Row>(cP, 'get_chat_artifact_attachment', { p_kind: 'letter', p_id: letterId }, 'P card (deleted)');
    expect(a.available).toBe(false);
  });
});

describe('P1545 WP1: sharing with an event posts into its channel', () => {
  it('posts one message in the event channel, none on a re-share; an attendee sees it unread via the event and opening it clears that', async () => {
    const ev = await createTestEvent(H.user.id, new Date(Date.now() + 5 * 24 * HOUR), { title: `P1545 share event ${RUN}` });
    events.push(ev);
    // The owner may share only with an event they host or attend (P1515 _canvas_event_admits).
    for (const u of [O, Q]) {
      const r = await supabaseAdmin.from('event_rsvps').insert({ event_id: ev.id, profile_id: u.user.id });
      expect(r.error).toBeNull();
    }

    await ok(cO, 'share_canvas', { p_name: NAME, p_kind: 'event', p_target: ev.id }, 'share with event');
    // An earlier test deletes the canvas, so this share may create a new row: read its id now.
    const { data: cv } = await supabaseAdmin.from('canvases').select('id').eq('owner_id', O.user.id).eq('name', NAME).single();
    const id = cv!.id;
    const { data: conv } = await supabaseAdmin.from('chat_conversations').select('id').eq('kind', 'event').eq('event_id', ev.id).single();
    expect(await artifactMessages(conv!.id, 'canvas', id)).toHaveLength(1);
    await ok(cO, 'share_canvas', { p_name: NAME, p_kind: 'event', p_target: ev.id }, 're-share with event');
    expect(await artifactMessages(conv!.id, 'canvas', id), 're-share posts nothing').toHaveLength(1);

    const row = (await ok<Row[]>(cQ, 'list_canvases_shared_with_me', undefined, 'Q shared')).find(x => x.canvas_id === id);
    expect(row, 'listed for the attendee').toBeDefined();
    expect(row!.unread).toBe(true);
    await ok(cQ, 'mark_canvas_read', { p_owner: O.user.id, p_name: NAME }, 'Q opens');
    const after = (await ok<Row[]>(cQ, 'list_canvases_shared_with_me', undefined, 'Q shared')).find(x => x.canvas_id === id);
    expect(after!.unread).toBe(false);
  });
});

describe('P1545 WP1: an empty, never-opened channel counts unread 1 (Inbox eligibility)', () => {
  it('an empty joined group is unread 1, mark_chat_read on the empty channel clears it', async () => {
    const first = await myChat(cZ, r => r.kind === 'group' && r.org_id === G2.id);
    expect(first, 'group channel listed').toBeDefined();
    expect(first!.last_message_id).toBeNull();
    expect(first!.unread_count).toBe(1);
    await ok(cZ, 'mark_chat_read', { p_conversation: first!.conversation_id }, 'open the empty channel');
    const after = await myChat(cZ, r => r.kind === 'group' && r.org_id === G2.id);
    expect(after!.unread_count).toBe(0);
    expect(after!.last_read_at).not.toBeNull();
  });

  it('an empty event channel is 0 more than 24h ahead, 1 inside the window, 0 again once opened', async () => {
    const far = await createTestEvent(H.user.id, new Date(Date.now() + 10 * 24 * HOUR), { title: `P1545 far ${RUN}` });
    const soon = await createTestEvent(H.user.id, new Date(Date.now() + 2 * HOUR), { title: `P1545 soon ${RUN}` });
    events.push(far, soon);
    for (const e of [far, soon]) {
      const r = await supabaseAdmin.from('event_rsvps').insert({ event_id: e.id, profile_id: Z.user.id });
      expect(r.error).toBeNull();
    }
    const farRow = await myChat(cZ, r => r.kind === 'event' && r.event_id === far.id);
    expect(farRow, 'far event channel listed').toBeDefined();
    expect(farRow!.unread_count, '10 days ahead').toBe(0);

    const soonRow = await myChat(cZ, r => r.kind === 'event' && r.event_id === soon.id);
    expect(soonRow!.unread_count, 'inside 24h').toBe(1);
    await ok(cZ, 'mark_chat_read', { p_conversation: soonRow!.conversation_id }, 'open');
    expect((await myChat(cZ, r => r.kind === 'event' && r.event_id === soon.id))!.unread_count).toBe(0);
  });

  it('an empty event channel more than the grace window after the start is 0', async () => {
    const over = await createTestEvent(H.user.id, new Date(Date.now() - 20 * HOUR), { title: `P1545 over ${RUN}` });
    events.push(over);
    await supabaseAdmin.from('event_rsvps').insert({ event_id: over.id, profile_id: Z.user.id, rsvped_at: new Date(Date.now() - 30 * HOUR).toISOString() });
    const row = await myChat(cZ, r => r.kind === 'event' && r.event_id === over.id);
    expect(row, 'listed (the RSVP was inside the window), so the 0 below is the rule and not an absent row').toBeDefined();
    expect(row!.unread_count).toBe(0);
  });

  it('real unread messages still win over the empty-channel rule', async () => {
    const gc = (await groupConv(G.id))!;
    const row = await myChat(cX, r => r.conversation_id === gc);
    expect(row!.unread_count, 'X never opened G and it holds messages').toBeGreaterThan(1);
  });
});

describe('P1545: the sender has their own seen mark, so later progress is new again', () => {
  it('only the sender can set it; progress after it makes the delivery new again', async () => {
    const doc = await createTestDoc(O.user.id, `P1545 seen ${RUN}`);
    docIds.push(doc.id);
    const letter = await createTestLetter(O.user.id, doc.id);
    letterIds.push(letter.id);
    await ok(cO, 'seal_and_send_letter', {
      p_letter_id: letter.id, p_predictions: [],
      p_deliveries: [{ receiver_profile_id: P.user.id, receiver_name: 'P' }], p_responses_mode: 'invite',
    }, 'seal to P');
    const { data: d } = await supabaseAdmin.from('letter_deliveries').select('id').eq('letter_id', letter.id).single();
    const id = d!.id as string;
    const mine = async () => (await ok<Row[]>(cO, 'get_deliveries_with_progress', { p_letter_ids: [letter.id] }, 'O reads')).find(r => r.id === id)!;

    // P opens and starts: new for O, and the recipient's own read mark does not hide it.
    const opened = new Date(Date.now() - 60_000).toISOString();
    await supabaseAdmin.from('letter_deliveries').update({ status: 'in_progress', opened_at: opened, read_at: opened }).eq('id', id);
    const before = await mine();
    expect(before.sender_seen_at).toBeNull();
    expect(hasNewSenderProgress(before)).toBe(true);

    // Nobody but the sender can write the mark.
    for (const c of [cP, cX]) {
      const { error } = await c.rpc('mark_delivery_seen_by_sender', { p_delivery_id: id });
      expect(error?.code).toBe('42501');
    }
    await ok(cO, 'mark_delivery_seen_by_sender', { p_delivery_id: id }, 'O looks');
    const seen = await mine();
    expect(seen.sender_seen_at).not.toBeNull();
    expect(hasNewSenderProgress(seen)).toBe(false);

    // P finishes later: new again for O.
    await new Promise(r => setTimeout(r, 1100));
    await supabaseAdmin.from('letter_deliveries').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', id);
    expect(hasNewSenderProgress(await mine())).toBe(true);
  });
});
