import { useState } from 'react';
import type { TermsChangeSummary } from '@/app/content/terms-changes';
import { supabase } from '@/lib/supabase';
import { needsTermsAcceptance } from '@/app/data/api';
import { termsPrompt, type TermsPrompt } from '@/app/content/terms-prompt';

/** The version this person last accepted. Throws on a failed read: a blip must not look like a stale account. */
export async function getAcceptedTermsVersion(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('accepted_terms_version')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data?.accepted_terms_version ?? null;
}

/** The popup this person must answer before going on, or null when a banner or nothing is enough. */
export async function blockingTermsPrompt(userId: string): Promise<TermsPrompt | null> {
  if (!(await needsTermsAcceptance(userId))) return null;
  try {
    const prompt = termsPrompt(await getAcceptedTermsVersion(userId));
    return prompt.mode === 'block' ? prompt : null;
  } catch {
    return { mode: 'block', missed: [] }; // read failed: ask rather than let them through unchecked
  }
}

/** A terms popup in front of a join. `missed` null means no popup is open; cancelling also drops the join. */
export function useJoinTermsPopup(pendingJoinRef: { current: unknown }) {
  const [missed, setMissed] = useState<TermsChangeSummary[] | null>(null);
  const cancel = () => {
    setMissed(null);
    pendingJoinRef.current = null;
  };
  return { missed, setMissed, cancel };
}
