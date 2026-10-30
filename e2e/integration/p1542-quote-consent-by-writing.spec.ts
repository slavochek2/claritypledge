/**
 * P1542 follow-up, migration 20261030120000_p1542_quote_consent_by_writing: on a hike, writing the recommendation IS
 * the permission to quote it, and clearing it withdraws — against the real TEST database, real RLS and a real JWT.
 *
 *   words saved + close finished      → one PENDING review; quote_ok true without any box write
 *   the founder approves               → the public (anon) read returns it         ← the positive control
 *   the person changes the words       → back to PENDING with the new words; gone from the public read
 *   approved again, then words cleared → REJECTED; the public read no longer returns it; quote_ok false
 *   words written again                → the rejected review stays rejected (never revived)
 *
 * The control matters: a public read that returned nothing for any reason would pass every "gone" step.
 */
import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, TEST_PASSWORD } from '../helpers/test-user';
import { createTestEvent, type TestEvent } from '../helpers/test-event';

test.describe.configure({ mode: 'serial' });

test.describe('P1542: on a hike, the words are the quote permission, and clearing them withdraws the review', () => {
  let userId: string;
  let email: string;
  let event: TestEvent;
  let person: SupabaseClient;
  let reviewId: string | undefined;
  const anon = () => createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

  const save = async (liked: string) => {
    const { error } = await person.rpc('save_event_feedback', { p_event_id: event.id, p_score: 9, p_liked: liked, p_improve: null, p_quote_ok: null });
    expect(error).toBeNull();
  };
  const review = async () => {
    const { data, error } = await supabaseAdmin.from('series_reviews').select('id, status, quote')
      .eq('source_event_id', event.id).eq('author_profile_id', userId);
    expect(error).toBeNull();
    return data ?? [];
  };
  const publicIds = async () => {
    const { data, error } = await anon().from('series_reviews').select('id').eq('series_slug', 'social-hike');
    expect(error).toBeNull();
    return (data ?? []).map((r) => r.id);
  };
  const quoteOk = async () => {
    const { data } = await supabaseAdmin.from('event_feedback').select('quote_ok').eq('event_id', event.id).eq('user_id', userId).single();
    return data?.quote_ok;
  };

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    const made = await createTestUser({ name: 'P1542 Consent Writer' });
    userId = made.user.id;
    email = made.email;
    // The host is an attendee for the close functions (p1389_is_attendee). An ended hike.
    event = await createTestEvent(userId, new Date(Date.now() - 3 * 3600 * 1000), { title: 'Social Hike: P1542 consent' });
    const { error } = await supabaseAdmin.from('events').update({ series_slug: 'social-hike' }).eq('id', event.id);
    expect(error).toBeNull();
    const { data, error: signInError } = await anon().auth.signInWithPassword({ email, password: TEST_PASSWORD });
    expect(signInError).toBeNull();
    person = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${data!.session!.access_token}` } },
    });
  });

  test.afterAll(async () => {
    test.setTimeout(120_000);
    // Test fixtures only, by id: the review, the feedback row, the event, the user.
    const left: string[] = [];
    const steps: Array<[string, () => PromiseLike<{ error: unknown }>]> = [
      ['series_reviews', () => supabaseAdmin.from('series_reviews').delete().eq('source_event_id', event.id)],
      ['event_feedback', () => supabaseAdmin.from('event_feedback').delete().eq('event_id', event.id)],
      ['event', () => supabaseAdmin.from('events').delete().eq('id', event.id)],
      ['auth user', () => supabaseAdmin.auth.admin.deleteUser(userId)],
    ];
    for (const [what, run] of steps) {
      try {
        const { error } = await run();
        if (error) left.push(`${what}: ${(error as { message?: string }).message ?? String(error)}`);
      } catch (e) {
        left.push(`${what}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    expect(left, `teardown left rows behind:\n${left.join('\n')}`).toEqual([]);
  });

  test('words saved and the close finished: one pending review, permission derived from the words', async () => {
    await save('An easy pace and kind people.');
    expect(await quoteOk()).toBe(true);
    const { error } = await person.rpc('finish_event_close', { p_event_id: event.id });
    expect(error).toBeNull();
    const rows = await review();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'pending', quote: 'An easy pace and kind people.' });
    reviewId = rows[0]!.id;
    expect(await publicIds()).not.toContain(reviewId); // nothing pending is public
  });

  test('control: once the founder approves it, the public read returns it', async () => {
    const { error } = await supabaseAdmin.from('series_reviews').update({ status: 'approved' }).eq('id', reviewId!);
    expect(error).toBeNull();
    expect(await publicIds()).toContain(reviewId);
  });

  test('changed words: back to pending with the new words, gone from the public read', async () => {
    await save('Come for the views, stay for the talk.');
    expect(await review()).toEqual([{ id: reviewId, status: 'pending', quote: 'Come for the views, stay for the talk.' }]);
    expect(await publicIds()).not.toContain(reviewId);
  });

  test('approved again, then the words cleared: rejected, and the public read no longer returns it', async () => {
    await supabaseAdmin.from('series_reviews').update({ status: 'approved' }).eq('id', reviewId!);
    expect(await publicIds()).toContain(reviewId); // control again, right before the withdrawal
    await save('');
    expect(await quoteOk()).toBe(false);
    expect(await review()).toEqual([{ id: reviewId, status: 'rejected', quote: 'Come for the views, stay for the talk.' }]);
    expect(await publicIds()).not.toContain(reviewId);
  });

  test('words written again: the withdrawn review stays rejected (never revived)', async () => {
    await save('Changed my mind, quote me.');
    expect(await quoteOk()).toBe(true);
    expect((await review())[0]).toMatchObject({ id: reviewId, status: 'rejected' });
    expect(await publicIds()).not.toContain(reviewId);
  });
});

/**
 * Review fixes, 20261030130000 (Gemini + Opus):
 *   set_event_quote_ok on a hike            → refused, 0A000 (Clarity Night: still accepted — the control)
 *   finished with no words, words added later → that save queues the pending review the finish could not
 *   whitespace only (tab, newline, U+00A0)  → no words: permission false, the review withdrawn
 *   words padded with U+00A0                 → stored trimmed; the founder script does not call them "text changed"
 *   approve over a review that is not pending → the conditional write matches nothing: refused (exit 4), unchanged
 */
test.describe('P1542 consent by writing, review fixes', () => {
  let userId: string;
  let hike: TestEvent;
  let night: TestEvent;
  let person: SupabaseClient;
  const anon = () => createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);
  const save = async (liked: string) => {
    const { error } = await person.rpc('save_event_feedback', { p_event_id: hike.id, p_score: 8, p_liked: liked, p_improve: null, p_quote_ok: null });
    expect(error).toBeNull();
  };
  const reviews = async () => {
    const { data, error } = await supabaseAdmin.from('series_reviews').select('id, status, quote, author_name')
      .eq('source_event_id', hike.id).eq('author_profile_id', userId);
    expect(error).toBeNull();
    return data ?? [];
  };
  const feedback = async () => (await supabaseAdmin.from('event_feedback').select('liked, quote_ok').eq('event_id', hike.id).eq('user_id', userId).single()).data;
  const script = async (...a: string[]) => {
    const { execFileSync } = await import('node:child_process');
    try { return { code: 0, out: execFileSync('node', ['scripts/series-reviews.mjs', ...a, '--env', 'test'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; }
    catch (e) { const x = e as { status: number; stdout: string; stderr: string }; return { code: x.status, out: x.stdout + x.stderr }; }
  };

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    const made = await createTestUser({ name: 'P1542 Consent Fixes' });
    userId = made.user.id;
    hike = await createTestEvent(userId, new Date(Date.now() - 3 * 3600 * 1000), { title: 'Social Hike: P1542 consent fixes' });
    night = await createTestEvent(userId, new Date(Date.now() - 3 * 3600 * 1000), { title: 'Clarity Night: P1542 consent fixes' });
    expect((await supabaseAdmin.from('events').update({ series_slug: 'social-hike' }).eq('id', hike.id)).error).toBeNull();
    const { data, error } = await anon().auth.signInWithPassword({ email: made.email, password: TEST_PASSWORD });
    expect(error).toBeNull();
    person = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${data!.session!.access_token}` } },
    });
  });

  test.afterAll(async () => {
    test.setTimeout(120_000);
    const left: string[] = [];
    const steps: Array<[string, () => PromiseLike<{ error: unknown }>]> = [
      ['series_reviews', () => supabaseAdmin.from('series_reviews').delete().in('source_event_id', [hike.id, night.id])],
      ['event_feedback', () => supabaseAdmin.from('event_feedback').delete().in('event_id', [hike.id, night.id])],
      ['events', () => supabaseAdmin.from('events').delete().in('id', [hike.id, night.id])],
      ['auth user', () => supabaseAdmin.auth.admin.deleteUser(userId)],
    ];
    for (const [what, run] of steps) {
      try {
        const { error } = await run();
        if (error) left.push(`${what}: ${(error as { message?: string }).message ?? String(error)}`);
      } catch (e) {
        left.push(`${what}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    expect(left, `teardown left rows behind:\n${left.join('\n')}`).toEqual([]);
  });

  test('set_event_quote_ok is refused on a hike (0A000); Clarity Night still takes it (control)', async () => {
    const at = new Date().toISOString();
    const onHike = await person.rpc('set_event_quote_ok', { p_event_id: hike.id, p_quote_ok: false, p_clicked_at: at });
    expect(onHike.error?.code).toBe('0A000');
    const onNight = await person.rpc('set_event_quote_ok', { p_event_id: night.id, p_quote_ok: false, p_clicked_at: at });
    expect(onNight.error).toBeNull();
  });

  test('finished with no words, then words added: that save queues the pending review the finish could not', async () => {
    await save('');
    expect((await person.rpc('finish_event_close', { p_event_id: hike.id })).error).toBeNull();
    expect(await reviews()).toEqual([]); // the control: nothing was handed off at the finish
    await save('Added after the thank-you.');
    const rows = await reviews();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'pending', quote: 'Added after the thank-you.', author_name: 'P1542 Consent Fixes' });
  });

  test('words padded with a no-break space are stored trimmed; the founder script sees no "text changed"', async () => {
    await save('  Padded words. \n');
    expect((await feedback())?.liked).toBe('Padded words.');
    expect((await reviews())[0]).toMatchObject({ status: 'pending', quote: 'Padded words.' });
    const list = await script('list');
    expect(list.code).toBe(0);
    const id = (await reviews())[0]!.id;
    const line = list.out.split('\n').find((l) => l.startsWith(id));
    expect(line).toBeDefined();
    expect(line).not.toContain('text changed');
  });

  test('a 2000-character quote ending in an emoji: the script counts code points like left(), so it is not "text changed"', async () => {
    // 1999 letters + 1 emoji = 2000 code points (the most event_feedback.liked holds) but 2001 UTF-16 units: a UTF-16
    // slice(0, 2000) would split the emoji and call the stored quote changed.
    const words = `${'a'.repeat(1999)}\u{1F600}`;
    await save(words);
    const id = (await reviews())[0]!.id;
    expect((await reviews())[0]!.quote).toBe(words);
    const line = (await script('list')).out.split('\n').find((l) => l.startsWith(id));
    expect(line).toBeDefined();
    expect(line).not.toContain('text changed');
  });

  test('approve over a review that is no longer pending writes nothing and refuses (exit 4)', async () => {
    const id = (await reviews())[0]!.id;
    // The founder rejected it in the meantime; the words and the permission are still in place, so only the
    // conditional write can catch it.
    expect((await supabaseAdmin.from('series_reviews').update({ status: 'rejected' }).eq('id', id)).error).toBeNull();
    const res = await script('approve', id);
    expect(res.code).toBe(4);
    expect(res.out).toContain('REFUSED');
    expect((await reviews())[0]).toMatchObject({ status: 'rejected' });
    const { data } = await anon().from('series_reviews').select('id').eq('id', id);
    expect(data).toEqual([]);
  });

  test('whitespace only (tab, newline, U+00A0) counts as no words: permission false, the review withdrawn', async () => {
    // A fresh pending review first (the previous one is rejected): re-queue by hand, as the founder would.
    const id = (await reviews())[0]!.id;
    await supabaseAdmin.from('series_reviews').update({ status: 'approved', quote: 'Padded words.' }).eq('id', id);
    expect((await anon().from('series_reviews').select('id').eq('id', id)).data).toEqual([{ id }]); // control
    await save(' \t\n  ');
    expect(await feedback()).toMatchObject({ liked: null, quote_ok: false });
    expect((await reviews())[0]).toMatchObject({ status: 'rejected' });
    expect((await anon().from('series_reviews').select('id').eq('id', id)).data).toEqual([]);
  });
});
