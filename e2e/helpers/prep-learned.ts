/** P1549: seed "this person has learned", so a test about the terms reaches them past the learning gate. */
import type { Page } from '@playwright/test';
import { supabaseAdmin } from './supabase-admin';

export async function seedLearned(profileId: string) {
  const at = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { error } = await supabaseAdmin.from('person_prep_parts').upsert(
    ['cognitive_video', 'cmp7'].map((part) => ({ profile_id: profileId, part, content_version: 1, completed_at: at })),
    { onConflict: 'profile_id,part' },
  );
  if (error) throw error;
}

/** Signed out, progress lives in this browser. */
export async function seedLearnedInBrowser(page: Page, parts: string[] = ['cognitive_video', 'cmp7']) {
  await page.addInitScript((names) => {
    const at = new Date().toISOString();
    localStorage.setItem('cp-prep-parts', JSON.stringify(Object.fromEntries(names.map((n) => [n, { contentVersion: 1, completedAt: at }]))));
  }, parts);
}
