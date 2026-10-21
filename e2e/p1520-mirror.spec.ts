/**
 * @file p1520-mirror.spec.ts
 *
 * P1520 Mirror v2 in the real UI on the test project.
 *
 *  1. smoke: a mirror reply shows as the mirror (its name, "reading" caption, no Forward); tapping the mirror's
 *     name opens its panel with Rename (and New face where the mirror can paint). Needs no AI: the reply is seeded.
 *  2. AI: a message written in the mirror gets a reply in the same chat.
 *  3. AI, two browsers: @mirror in a group's channel — the asker sees the ask and the answer marked private; a second
 *     member of the same channel sees neither, also after the app re-reads.
 *  4. AI: New face paints a portrait; the chosen face (gender) is used for the next one.
 *
 * Tests 2-4 call the real model and run only where the server says the mirror is on (MIRROR_AI_ENABLED and the
 * mirror's own key set on the test project). Elsewhere they are SKIPPED with that reason, never passed.
 */
import { test, expect as baseExpect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createTestMembership, createTestOrganization, deleteTestOrganization, type TestOrganization } from './helpers/test-organization';
import { supabaseAdmin } from './helpers/supabase-admin';
import { adminConversation, mirrorOf, purgeChatFor, signIn, type SignedIn } from './helpers/test-chat';

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const expect = baseExpect.configure({ timeout: 30_000 });
const NO_AI = 'the mirror is off on this project (MIRROR_AI_ENABLED and the mirror key are not set on test yet)';

test.describe.configure({ mode: 'serial' });
test.setTimeout(150_000);

let a: TestUser;
let b: TestUser;
let org: TestOrganization;
let sA: SignedIn;
let mirrorA: string;
let channel: string;
let aiOn = false;

async function openAs(browser: Browser, user: TestUser): Promise<{ ctx: BrowserContext; page: Page; errors: string[] }> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await setTestSession(page, user.email);
  return { ctx, page, errors };
}

test.beforeAll(async () => {
  test.setTimeout(180_000);
  org = await createTestOrganization({ name: `P1520 Mirror Org ${RUN}` });
  a = await createTestUser({ name: `Mirrortest A ${RUN}` });
  b = await createTestUser({ name: `Mirrortest B ${RUN}` });
  await createTestMembership(org.id, a.user.id);
  await createTestMembership(org.id, b.user.id);
  sA = await signIn(a);
  mirrorA = await mirrorOf(sA);
  channel = await adminConversation('group', { org_id: org.id });
  const { data } = await sA.client.functions.invoke('mirror-reply', { body: { availability: true } });
  aiOn = (data as { enabled?: boolean } | null)?.enabled === true;
});

test.afterAll(async () => {
  test.setTimeout(120_000);
  await purgeChatFor([a.user.id, b.user.id]);
  await deleteTestUser(a.user.id).catch(() => {});
  await deleteTestUser(b.user.id).catch(() => {});
  await deleteTestOrganization(org.id);
});

test('smoke: a mirror reply shows as the mirror, and the mirror\'s name opens its panel', async ({ browser }) => {
  const question = `What did she mean ${RUN}?`;
  const answer = `She may have meant the deadline ${RUN}.`;
  const { data: q } = await supabaseAdmin.from('chat_messages')
    .insert({ conversation_id: mirrorA, author_id: a.user.id, body: question, kind: 'message' }).select('id').single();
  await supabaseAdmin.from('chat_messages')
    .insert({ conversation_id: mirrorA, author_id: null, body: answer, kind: 'agent', reply_to_id: q!.id }).select('id').single();

  const { ctx, page, errors } = await openAs(browser, a);
  try {
    await page.goto(`/home/c/${mirrorA}`);
    const reply = page.locator('[data-testid="message"]', { hasText: answer });
    await expect(reply).toBeVisible();
    await expect(reply.getByTestId('mirror-author')).toContainText('Your mirror');
    await expect(reply.getByTestId('mirror-reading')).toBeVisible();
    await expect(reply.getByText('Deleted user')).toHaveCount(0);
    await reply.hover();
    await expect(reply.getByRole('button', { name: 'Reply', exact: true })).toBeVisible();
    await expect(reply.getByRole('button', { name: 'Forward', exact: true })).toHaveCount(0);

    await page.getByTestId('mirror-info-open').click();
    const panel = page.getByTestId('mirror-info');
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Rename' })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'New face' })).toHaveCount(aiOn ? 1 : 0);
    expect(errors, 'no page errors').toEqual([]);
  } finally {
    await ctx.close();
  }
});

test('AI: a message written in the mirror gets a reply in the same chat', async ({ browser }) => {
  test.skip(!aiOn, NO_AI);
  const { ctx, page } = await openAs(browser, a);
  try {
    await page.goto(`/home/c/${mirrorA}`);
    const text = `I think my co-founder was annoyed in today's call ${RUN}`;
    await page.getByRole('textbox').fill(text);
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.locator('[data-testid="message"]', { hasText: text })).toBeVisible();
    await expect(page.getByTestId('mirror-author').last()).toBeVisible({ timeout: 90_000 });
  } finally {
    await ctx.close();
  }
});

test('AI, two browsers: @mirror in a channel is seen by the asker only', async ({ browser }) => {
  test.skip(!aiOn, NO_AI);
  const said = `B: the launch slips a week ${RUN}`;
  const sB = await signIn(b);
  await sB.client.rpc('send_chat_message', { p_conversation: channel, p_body: said });
  const question = `what does B worry about ${RUN}`;

  const A = await openAs(browser, a);
  const B = await openAs(browser, b);
  try {
    await B.page.goto(`/home/c/${channel}`);
    await expect(B.page.getByTestId('message-scroller').getByText(said)).toBeVisible();
    await A.page.goto(`/home/c/${channel}`);
    await expect(A.page.getByTestId('message-scroller').getByText(said)).toBeVisible();

    const field = A.page.getByRole('textbox');
    await field.pressSequentially('@mir');
    await expect(A.page.getByTestId('mention-picker')).toContainText('private');
    await A.page.getByRole('option').first().click();
    await expect(A.page.getByTestId('private-mode')).toContainText('only you see this');
    await A.page.getByRole('textbox').fill(question);
    await A.page.getByRole('button', { name: 'Send' }).click();

    const askRow = A.page.locator('[data-testid="message"]', { hasText: question });
    await expect(askRow).toBeVisible();
    await expect(askRow.getByTestId('mirror-private')).toBeVisible();
    // the answer lands for A, marked private
    const answerRow = A.page.locator('[data-testid="message"]').filter({ has: A.page.getByTestId('mirror-author') });
    await expect(answerRow.last()).toBeVisible({ timeout: 90_000 });
    await expect(answerRow.last().getByTestId('mirror-private')).toBeVisible();
    const answerText = (await answerRow.last().locator('p').first().innerText()).slice(0, 40);

    // B: same channel, after the answer exists and after a re-read, sees neither
    for (let i = 0; i < 3; i++) {
      await B.page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await B.page.waitForTimeout(1500);
    }
    await expect(B.page.getByText(question)).toHaveCount(0);
    await expect(B.page.getByText(answerText, { exact: false })).toHaveCount(0);
    await expect(B.page.getByTestId('mirror-author')).toHaveCount(0);
    // CONTROL: B's page is live — a new channel message from A still arrives
    await sA.client.rpc('send_chat_message', { p_conversation: channel, p_body: `control ${RUN}` });
    await expect(B.page.getByTestId('message-scroller').getByText(`control ${RUN}`)).toBeVisible();
  } finally {
    await A.ctx.close();
    await B.ctx.close();
  }
});

test('AI: a new user\'s mirror gets a portrait on first open, shown with the agent tint', async ({ browser }) => {
  test.skip(!aiOn, NO_AI);
  // B has never opened their mirror and has no portrait.
  const sB = await signIn(b);
  const mirrorB = await mirrorOf(sB);
  const before = (await supabaseAdmin.from('chat_conversations').select('portrait_url').eq('id', mirrorB).single()).data?.portrait_url ?? null;
  expect(before, 'B starts without a portrait').toBeNull();
  const { ctx, page } = await openAs(browser, b);
  try {
    await page.goto(`/home/c/${mirrorB}`);
    await expect.poll(async () =>
      (await supabaseAdmin.from('chat_conversations').select('portrait_url, portrait_credit').eq('id', mirrorB).single()).data,
    { timeout: 120_000 }).toMatchObject({ portrait_url: expect.any(String), portrait_credit: expect.objectContaining({}) });
    const credit = (await supabaseAdmin.from('chat_conversations').select('portrait_credit').eq('id', mirrorB).single()).data?.portrait_credit as { artist?: string } | null;
    expect(credit?.artist, 'painted in a named artist style').toBeTruthy();
    // the face is shown with the agent treatment (navy tint over the image)
    const mark = page.getByTestId('mirror-portrait').first().locator('..');
    await expect(page.getByTestId('mirror-portrait').first()).toBeVisible({ timeout: 60_000 });
    await expect(mark.getByTestId('agent-tint')).toHaveCount(1);
  } finally {
    await ctx.close();
  }
});

test('AI: New face paints a portrait, and the chosen face is used for the next one', async ({ browser }) => {
  test.skip(!aiOn, NO_AI);
  const { ctx, page } = await openAs(browser, a);
  try {
    await page.goto(`/home/c/${mirrorA}`);
    await page.getByTestId('mirror-info-open').click();
    const panel = page.getByTestId('mirror-info');
    await panel.getByRole('radio', { name: 'Female' }).click();
    const before = (await supabaseAdmin.from('chat_conversations').select('portrait_url').eq('id', mirrorA).single()).data?.portrait_url ?? null;
    await panel.getByRole('button', { name: 'New face' }).click();
    await expect(panel.getByTestId('mirror-portrait')).toBeVisible({ timeout: 120_000 });
    await expect.poll(async () => {
      const { data } = await supabaseAdmin.from('chat_conversations').select('portrait_url, portrait_credit, portrait_gender').eq('id', mirrorA).single();
      return data && data.portrait_url !== before ? { gender: data.portrait_gender, painted: (data.portrait_credit as { gender?: string })?.gender } : null;
    }, { timeout: 120_000 }).toEqual({ gender: 'female', painted: 'female' });
  } finally {
    await ctx.close();
  }
});
