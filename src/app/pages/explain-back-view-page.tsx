/**
 * @file explain-back-view-page.tsx
 * @description P904: Focus page for an async letter explain-back (/explain-back/:id).
 *
 * The author (letter sender) opens the receiver's recorded explanation here, async —
 * no rating, no certify (that is the entire author-side interaction in v0). Made an
 * independently routable focus page so a future inbox notification can deep-link to it.
 *
 * Access: the SELECT RLS on story_explain_backs is the real gate — a non-participant's
 * fetch returns null, so we redirect to /letters. The client redirect is cosmetic.
 */
import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { ClarityPageLoader } from '@/components/ui/clarity-loader';
import { FocusHeader } from '@/app/components/layout/focus-header';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { useAuth } from '@/auth';
import { supabase } from '@/lib/supabase';
import { formatTimeAgo } from '@/app/utils/format-time';
import {
  getExplainBackById,
  getExplainBackSignedUrl,
  markExplainBackRead,
} from '@/app/data/letters-service';
import type { ExplainBackRow } from '@/app/types';

interface RecorderProfile {
  name: string;
  avatarUrl?: string;
  avatarColor?: string;
  hasPledged: boolean;
}

export function ExplainBackViewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, sessionChecked, isLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [explainBack, setExplainBack] = useState<ExplainBackRow | null>(null);
  const [recorder, setRecorder] = useState<RecorderProfile | null>(null);
  const [storyTitle, setStoryTitle] = useState<string>('');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionChecked || isLoading) return;
    if (!user) {
      navigate('/login', { replace: true });
      return;
    }
    if (!id) {
      navigate('/letters', { replace: true });
      return;
    }

    let cancelled = false;

    (async () => {
      const eb = await getExplainBackById(id);
      // Pair-private RLS returns null for non-participants → access gate.
      if (!eb) {
        if (!cancelled) navigate('/letters', { replace: true });
        return;
      }
      if (cancelled) return;
      setExplainBack(eb);

      // Recorder identity + story title (parallel; both pair-visible).
      const [{ data: profile }, { data: snapshot }] = await Promise.all([
        supabase
          .from('profiles')
          .select('name, avatar_url, avatar_color, has_pledged')
          .eq('id', eb.recorder_id)
          .single(),
        supabase
          .from('letter_story_snapshots')
          .select('point_config')
          .eq('letter_id', eb.letter_id)
          .eq('story_id', eb.story_id)
          .single(),
      ]);
      if (cancelled) return;

      if (profile) {
        setRecorder({
          name: profile.name ?? 'Someone',
          avatarUrl: profile.avatar_url ?? undefined,
          avatarColor: profile.avatar_color ?? undefined,
          hasPledged: profile.has_pledged ?? false,
        });
      }
      const config = (snapshot?.point_config ?? {}) as { storyTitle?: string };
      setStoryTitle(config.storyTitle ?? '');

      // Audio playback URL (membership re-checked server-side at sign time).
      let audioReady = false;
      if (eb.medium === 'audio' && eb.audio_storage_path) {
        const url = await getExplainBackSignedUrl(eb.id);
        if (url) {
          audioReady = true;
          if (!cancelled) setAudioUrl(url);
        }
      }

      // Mark read only once the content is actually presentable to the author — never
      // on a sign/load failure (else the inbox signal clears though they never heard it).
      // recorder = receiver; anyone else who can see the row is the sender (RLS).
      const contentReady = eb.medium === 'text' || audioReady;
      if (user.id !== eb.recorder_id && eb.author_read_at === null && contentReady) {
        // Best-effort: the RPC logs its own Supabase error and resolves void. The
        // .catch guards only the rare unexpected throw (e.g. network) so it can't
        // become an unhandled rejection; on any failure the sender's unread dot
        // simply persists until their next open.
        void markExplainBackRead(eb.id).catch(() => {});
      }

      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [id, user, sessionChecked, isLoading, navigate]);

  const handleBack = () => {
    if (explainBack) {
      navigate(`/letter/${explainBack.letter_id}/results?delivery=${explainBack.delivery_id}`);
    } else {
      navigate('/letters');
    }
  };

  if (loading || !explainBack) {
    return (
      <div className="px-4 py-6 max-w-lg mx-auto">
        <FocusHeader onBack={handleBack} label="Back" />
        <ClarityPageLoader />
      </div>
    );
  }

  const recorderName = recorder?.name ?? 'Someone';

  return (
    <div className="px-4 py-6 max-w-lg mx-auto">
      <FocusHeader onBack={handleBack} label="Back" />

      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">What {recorderName} understood</p>

        {storyTitle && (
          <p className="text-sm text-foreground">
            On your story:{' '}
            <Link to={`/story/${explainBack.story_id}`} className="text-blue-600 hover:underline">
              {storyTitle}
            </Link>
            <ExternalLink size={12} className="inline ml-0.5 text-blue-600" />
          </p>
        )}

        <div className="flex items-center gap-2">
          <GravatarAvatar
            name={recorderName}
            photoUrl={recorder?.avatarUrl}
            avatarColor={recorder?.avatarColor}
            isPledger={recorder?.hasPledged ?? false}
            size="sm"
          />
          <span className="text-sm text-foreground">{recorderName}</span>
          <span className="text-xs text-muted-foreground">{formatTimeAgo(explainBack.created_at)}</span>
        </div>

        {explainBack.medium === 'audio' ? (
          <>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption -- user voice recording; transcript deferred (P904) */}
            <audio
              controls
              src={audioUrl ?? undefined}
              className="w-full rounded-md border border-border bg-muted h-12"
            />
            <p className="text-xs text-muted-foreground italic">(Transcript coming soon)</p>
          </>
        ) : (
          <div className="rounded-md border border-border bg-muted/50 p-4 text-sm text-foreground whitespace-pre-wrap">
            {explainBack.text_fallback}
          </div>
        )}
      </div>
    </div>
  );
}
