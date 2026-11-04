/**
 * @file use-prepare-modes.ts
 * @description P1549: which shape /prepare takes. ?then=join&group=<slug>: the learning before joining a group.
 * ?review=<in-app path>: replay it and return. Anything else, or a group that does not exist: the plain page.
 * Join mode waits for every read, and a failed read is an error, never empty progress.
 */
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/auth';
import { useReturnToParent } from '@/app/hooks/use-go-back';
import { organizationsService } from '@/app/data/organizations-service';
import type { PrepPartRow } from '@/app/data/event-prep-service';
import { hasLearned } from './prep-plan';
import { useLearnedRead } from './use-learned-read';

export type JoinMode = { groupName: string; onFinish: () => void; onExit: () => void };
export type ReviewMode = { onReturn: () => void };
type Gate =
  | { kind: 'plain' }
  | { kind: 'pending' }
  | { kind: 'error'; retry: () => void; fallback: string }
  | { kind: 'join'; join: JoinMode; rows: PrepPartRow[] | undefined }
  | { kind: 'review'; review: ReviewMode };

const IN_APP_PATH = /^\/[^/\\]/;

export function useJoinLearningGate(): Gate {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isLoading, sessionChecked } = useAuth();
  const routeState = location.state as { fromCaller?: boolean } | null;

  const rawReview = params.get('review');
  const reviewPath = rawReview && IN_APP_PATH.test(rawReview) ? rawReview : null;
  const onReturn = useReturnToParent(reviewPath ?? '/prepare', !!routeState?.fromCaller);

  const slug = params.get('then') === 'join' ? params.get('group') : null;
  const joinPath = useMemo(() => {
    const q = new URLSearchParams();
    for (const k of ['from', 'return']) { const v = params.get(k); if (v) q.set(k, v); }
    return `/groups/${slug}/join${q.size ? `?${q}` : ''}`;
  }, [params, slug]);

  const [group, setGroup] = useState<{ id: string; name: string } | null | undefined>(undefined);
  const [groupFailed, setGroupFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setGroup(undefined);
    setGroupFailed(false);
    organizationsService.getOrganizationBySlug(slug)
      .then((o) => { if (!cancelled) setGroup(o ?? null); })
      .catch(() => { if (!cancelled) setGroupFailed(true); });
    return () => { cancelled = true; };
  }, [slug, attempt]);

  const authReady = !isLoading && sessionChecked;
  const learned = useLearnedRead(user?.id, !!slug && authReady && !!group);

  const orgId = group?.id;
  const [member, setMember] = useState<boolean | undefined>(undefined);
  const [memberFailed, setMemberFailed] = useState(false);
  useEffect(() => {
    if (!slug || !authReady || !orgId) return;
    if (!user?.id) { setMember(false); return; }
    let cancelled = false;
    setMember(undefined);
    setMemberFailed(false);
    organizationsService.getMyMembership(orgId)
      .then((m) => { if (!cancelled) setMember(!!m); })
      .catch(() => { if (!cancelled) setMemberFailed(true); });
    return () => { cancelled = true; };
  }, [slug, authReady, orgId, user?.id, attempt]);

  const alreadyThrough = !!slug && (member === true || (learned.status === 'ok' && hasLearned(learned.parts, learned.completedAt)));
  useEffect(() => {
    if (alreadyThrough) navigate(joinPath, { replace: true });
    // Decided once on open: finishing the steps navigates by itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alreadyThrough && group !== undefined && member !== undefined]);

  const [opened, setOpened] = useState(false);
  const readsDone = !!group && member !== undefined && learned.status === 'ok';
  useEffect(() => { if (readsDone && !alreadyThrough) setOpened(true); }, [readsDone, alreadyThrough]);

  const join: JoinMode = useMemo(() => ({
    groupName: group?.name ?? '',
    onFinish: () => navigate(joinPath, { replace: true, state: { joinViaLearning: true } }),
    onExit: () => navigate(joinPath, { replace: true }),
  }), [group?.name, navigate, joinPath]);

  if (reviewPath && !slug) return { kind: 'review', review: { onReturn } };
  if (!slug) return { kind: 'plain' };
  if (opened) return { kind: 'join', join, rows: learned.status === 'ok' ? learned.parts : undefined };
  if (group === null) return { kind: 'plain' };
  const fail = groupFailed || memberFailed || learned.status === 'error';
  if (fail) return { kind: 'error', fallback: joinPath, retry: () => { setAttempt((n) => n + 1); learned.retry(); } };
  return { kind: 'pending' };
}
