/**
 * @file create-story-page.tsx
 * @description P126: Create Story page — auth-gated form with visibility control.
 * Route: /create
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useAuth } from '@/auth';
import { storiesService } from '@/app/data/stories-service';
import { docsService } from '@/app/data/docs-service';
import { pointsService } from '@/app/data/points-service';
import { extractHashtags } from '@/lib/utils';
import { toast } from 'sonner';
import { useVerificationGate } from '@/app/hooks/useVerificationGate';
import { useDocContext } from '@/app/hooks/use-doc-context';
import { Loader2Icon, ArrowLeft, Lock, Globe } from 'lucide-react';
import { ClarityLoader } from '@/components/ui/clarity-loader';
import { DocPrivacyBanner } from '@/app/components/docs/doc-privacy-banner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { analytics } from '@/lib/mixpanel';
import { ChatContextHeader } from '@/app/components/story-guide/ChatContextHeader';

/** Soft character marker — not a hard limit, just the sweet spot for verification */
const CHAR_SOFT_MARKER = 280;

/** Max content length to prevent abuse */
const CHAR_MAX = 10000;

export function CreateStoryPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user, session, isLoading: authLoading } = useAuth();
  const { checkVerified } = useVerificationGate();
  const {
    docId,
    docTitle,
    docVisibility,
    isDocContext,
    isLoading: docLoading,
    backPath,
  } = useDocContext();

  // Point context from query params
  const pointId = searchParams.get('pointId') || '';

  // Form state
  const [content, setContent] = useState('');
  // P586: create-story-page is always public — unless within doc context (P551)
  const visibility = isDocContext && docVisibility ? docVisibility : 'public' as const;

  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<{ content?: string }>({});
  const hasTrackedPageView = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Point context state
  const [pointLoading, setPointLoading] = useState(!!pointId);
  const [pointText, setPointText] = useState<string | null>(null);
  const [userPosition, setUserPosition] = useState<'agree' | 'disagree' | 'unsure' | null>(null);
  const [pointLoadedId, setPointLoadedId] = useState<string | null>(null);

  // Fetch point + position in parallel when pointId is present
  useEffect(() => {
    if (!pointId || !user?.id) return;

    let cancelled = false;
    setPointLoading(true);

    Promise.all([
      pointsService.getPoint(pointId),
      pointsService.getMyPosition(pointId, user.id),
    ]).then(([point, position]) => {
      if (cancelled) return;
      if (point) {
        setPointText(point.statement);
        setPointLoadedId(point.id);
        // Map granular 7-value positions to 3-value for ChatContextHeader display
        const pos = position?.position;
        if (pos) {
          if (pos === 'agree' || pos === 'somewhat_agree' || pos === 'strongly_agree') {
            setUserPosition('agree');
          } else if (pos === 'disagree' || pos === 'somewhat_disagree' || pos === 'strongly_disagree') {
            setUserPosition('disagree');
          } else {
            setUserPosition('unsure');
          }
        }
      }
      // If point is null (not found), graceful degradation — no banner
      setPointLoading(false);
    }).catch(() => {
      if (!cancelled) setPointLoading(false);
    });

    return () => { cancelled = true; };
  }, [pointId, user?.id]);

  // Auto-focus textarea: after point loads (if pointId), or on mount (if no pointId)
  useEffect(() => {
    if (pointId && pointLoading) return; // Wait for point to load
    if (authLoading || !session) return;
    textareaRef.current?.focus();
  }, [pointId, pointLoading, authLoading, session]);

  // Track page view
  useEffect(() => {
    if (!authLoading && session && user && !hasTrackedPageView.current) {
      hasTrackedPageView.current = true;
      analytics.track('story_creation_started', pointId ? { linked_point_id: pointId } : undefined);
    }
  }, [authLoading, session, user, pointId]);

  // Auth redirect — P396: unauthenticated users go to signup (not login)
  // P486: preserve return URL via ?redirect= query param (P76 pattern)
  useEffect(() => {
    if (!authLoading && !session) {
      const returnUrl = location.pathname + location.search;
      navigate(`/signup?redirect=${encodeURIComponent(returnUrl)}`);
    }
  }, [authLoading, session, navigate, location.pathname, location.search]);

  // Auto-resize textarea
  const autoResize = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.max(textarea.scrollHeight, 150)}px`;
    }
  }, []);

  useEffect(() => {
    autoResize();
  }, [content, autoResize]);

  // Clear errors inline when user types
  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val.length <= CHAR_MAX ? val : val.slice(0, CHAR_MAX));
    if (errors.content && val.trim()) {
      setErrors(prev => ({ ...prev, content: undefined }));
    }
  };

  const validate = (): boolean => {
    const newErrors: { content?: string } = {};
    if (!content.trim()) {
      newErrors.content = 'Story content is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate() || !user?.id) return;
    if (!checkVerified('create a story')) return;

    setIsSaving(true);

    try {
      const trimmedContent = content.trim();
      const story = await storiesService.createStory(
        user.id,
        trimmedContent,
        extractHashtags(trimmedContent),
        visibility
      );

      if (!story) {
        toast.error('Save failed. Please try again.');
        setIsSaving(false);
        return;
      }

      // P560: Link story to point if we have a valid point context (position not required)
      let linkFailed = false;
      if (pointLoadedId) {
        try {
          const linked = await storiesService.linkPointToStory(story.id, pointLoadedId, user.id);
          if (!linked) linkFailed = true;
        } catch {
          linkFailed = true;
        }
      }

      const words = content.trim().split(/\s+/).filter(Boolean);
      analytics.track('story_created', {
        story_id: story.id,
        has_points: !!pointLoadedId,
        points_count: pointLoadedId ? 1 : 0,
        linked_point_id: pointLoadedId || undefined,
        word_count: words.length,
        visibility,
      });
      // Legacy event kept for backward compatibility with existing Mixpanel charts
      analytics.track('story_saved', {
        story_id: story.id,
        char_count: content.trim().length,
        visibility,
      });

      // P551: Link story to doc if in doc context
      let docLinkFailed = false;
      if (isDocContext && docId) {
        try {
          await docsService.addStoryToDoc(docId, story.id);
        } catch {
          docLinkFailed = true;
        }
      }

      const toastMsg = linkFailed
        ? 'Story saved! (Point link could not be saved)'
        : docLinkFailed
          ? 'Story saved! (Could not add to doc)'
          : 'Story saved!';
      toast.success(toastMsg);

      navigate(`/story/${story.id}`, {
        state: {
          justCreated: true,
          ...(isDocContext && docId ? { docId, docTitle } : {}),
        },
        replace: true,
      });
    } catch (err) {
      console.error('Error creating story:', err);
      toast.error('Save failed. Please check your connection and try again.');
      setIsSaving(false);
    }
  };

  // Loading state while checking auth
  if (authLoading) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-2xl">
        <div className="flex items-center justify-center">
          <ClarityLoader size="lg" />
        </div>
      </div>
    );
  }

  // Don't render if not authenticated (redirect will happen)
  if (!session) {
    return null;
  }

  return (
    <div className="container mx-auto px-4 py-8 md:py-12 max-w-2xl">
      <Button
        variant="ghost"
        onClick={() => isDocContext ? navigate(backPath) : navigate(-1)}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 -ml-2 min-h-[44px] px-3"
        aria-label={isDocContext ? `Back to ${docTitle}` : 'Go back'}
      >
        <ArrowLeft size={16} />
        {isDocContext ? docTitle || 'Back' : 'Back'}
      </Button>

      {/* Point context banner (P486) — only render region when loading or point found */}
      {pointId && (pointLoading || (pointText && pointLoadedId)) && (
        <div
          role="region"
          aria-label="Point context"
          aria-live="polite"
          aria-busy={pointLoading}
          className="mb-4"
        >
          {pointLoading ? (
            <div className="animate-pulse bg-muted rounded h-[48px]" />
          ) : pointText && pointLoadedId ? (
            <ChatContextHeader
              pointId={pointLoadedId}
              pointText={pointText}
              userPosition={userPosition}
              sticky={false}
            />
          ) : null}
        </div>
      )}

      {/* Doc privacy banner (P551) */}
      {isDocContext && docVisibility && (
        <div className="mb-4">
          <DocPrivacyBanner visibility={docVisibility} />
        </div>
      )}

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Share a Story</h1>
        <p className="text-muted-foreground mt-2">
          Write a perspective. Others verify what they understood.
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Story Content */}
        <div>
          <label htmlFor="story-content" className="block text-sm font-medium mb-2">
            Your story
          </label>
          <Textarea
            ref={textareaRef}
            id="story-content"
            value={content}
            onChange={handleContentChange}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                handleSubmit(e as unknown as React.FormEvent);
              }
            }}
            rows={6}
            disabled={pointLoading}
            tabIndex={pointLoading ? -1 : undefined}
            aria-disabled={pointLoading || undefined}
            aria-describedby={errors.content ? 'content-error' : 'content-hint'}
            aria-invalid={errors.content ? 'true' : undefined}
            className={`px-4 py-3 resize-y min-h-[150px] ${errors.content ? 'border-red-500' : ''}`}
            placeholder="Share a moment, experience, or perspective..."
          />
          <div className="flex justify-between items-center mt-1">
            <span id="content-hint" className="text-xs text-muted-foreground">
              {content.length > 0
                ? content.length < CHAR_SOFT_MARKER
                  ? `${content.length} characters · aim for under ${CHAR_SOFT_MARKER} for best results`
                  : `${content.length} characters · longer is fine`
                : '\u00A0'}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Paste URLs or write <code className="text-xs bg-muted px-1 py-0.5 rounded">[click here](https://...)</code> for named links
          </p>
          {errors.content && (
            <p id="content-error" className="text-sm text-red-500 mt-1" role="alert">
              {errors.content}
            </p>
          )}
        </div>

        {/* P586: Visibility selector removed — create-story-page is always public.
           Private story creation is only available from within Clarity Docs (P551). */}

        {/* Submit Button */}
        <div className="pt-4">
          <Button
            type="submit"
            disabled={isSaving || pointLoading || docLoading}
            className="bg-blue-500 hover:bg-blue-600 text-white min-h-[44px]"
          >
            {isSaving ? (
              <>
                <Loader2Icon className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : isDocContext && docVisibility === 'private' ? (
              <>
                <Lock size={16} />
                Save Private Story
              </>
            ) : isDocContext && docVisibility === 'public' ? (
              <>
                <Globe size={16} />
                Save Public Story
              </>
            ) : (
              'Publish Story'
            )}
          </Button>
        </div>
      </form>

    </div>
  );
}

export default CreateStoryPage;
