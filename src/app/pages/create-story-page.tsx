/**
 * @file create-story-page.tsx
 * @description P126: Create Story page — auth-gated form with visibility control.
 * Route: /create
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth';
import { storiesService } from '@/app/data/stories-service';
import { toast } from 'sonner';
import { Loader2Icon, GlobeIcon, LockIcon, UsersIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { analytics } from '@/lib/mixpanel';
import { MobileTooltip } from '@/app/components/shared/mobile-tooltip';
import type { StoryVisibility } from '@/app/types';

/** Soft character marker — not a hard limit, just the sweet spot for verification */
const CHAR_SOFT_MARKER = 280;

/** Max content length to prevent abuse */
const CHAR_MAX = 10000;

const VISIBILITY_OPTIONS: {
  value: StoryVisibility;
  icon: typeof GlobeIcon;
  label: string;
  tooltip: string;
}[] = [
  { value: 'public', icon: GlobeIcon, label: 'Public', tooltip: 'Anyone can see this' },
  { value: 'shared', icon: UsersIcon, label: 'Shared', tooltip: 'Visible only in /live sessions you share it in' },
  { value: 'private', icon: LockIcon, label: 'Private', tooltip: 'Only you can see this' },
];

export function CreateStoryPage() {
  const navigate = useNavigate();
  const { user, session, isLoading: authLoading } = useAuth();

  // Form state
  const [content, setContent] = useState('');
  const [visibility, setVisibility] = useState<StoryVisibility>('public');

  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<{ content?: string }>({});
  const hasTrackedPageView = useRef(false);
  const [isSaved, setIsSaved] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Derived dirty state
  const isDirty = content.trim().length > 0;

  // Track page view
  useEffect(() => {
    if (!authLoading && session && user && !hasTrackedPageView.current) {
      hasTrackedPageView.current = true;
      analytics.track('story_creation_started');
    }
  }, [authLoading, session, user]);

  // Abandonment tracking via beforeunload (for tab close / external nav)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty && !isSaved) {
        analytics.track('story_creation_abandoned');
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty, isSaved]);

  // Auth redirect
  useEffect(() => {
    if (!authLoading && !session) {
      navigate('/login?redirect=/create');
    }
  }, [authLoading, session, navigate]);

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
    if (val.length <= CHAR_MAX) {
      setContent(val);
    }
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

    setIsSaving(true);

    try {
      const story = await storiesService.createStory(
        user.id,
        content.trim(),
        [],
        visibility
      );

      if (!story) {
        toast.error('Save failed. Please try again.');
        setIsSaving(false);
        return;
      }

      // Mark as saved so beforeunload doesn't fire
      setIsSaved(true);

      analytics.track('story_saved', {
        story_id: story.id,
        char_count: content.trim().length,
        visibility,
      });

      toast.success('Story saved!');
      navigate(`/story/${story.id}`);
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
          <Loader2Icon className="w-8 h-8 animate-spin text-muted-foreground" />
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
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Create a Story</h1>
        <p className="text-muted-foreground mt-2">
          Share a perspective others can verify their understanding of
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Story Content */}
        <div>
          <label htmlFor="story-content" className="block text-sm font-medium mb-2">
            Your story <span className="text-red-500">*</span>
          </label>
          <Textarea
            ref={textareaRef}
            id="story-content"
            value={content}
            onChange={handleContentChange}
            rows={6}
            aria-describedby={errors.content ? 'content-error' : 'content-hint'}
            aria-invalid={errors.content ? 'true' : undefined}
            className={`px-4 py-3 resize-y min-h-[150px] ${errors.content ? 'border-red-500' : ''}`}
            placeholder="Share a moment, experience, or perspective..."
          />
          <div className="flex justify-between items-center mt-1">
            <span id="content-hint" className="text-xs text-muted-foreground">
              {content.length >= CHAR_SOFT_MARKER
                ? `${CHAR_SOFT_MARKER} chars is the sweet spot for verification — longer is fine`
                : '\u00A0'}
            </span>
            <span className="text-sm text-muted-foreground">
              {content.length}/{CHAR_SOFT_MARKER}
            </span>
          </div>
          {errors.content && (
            <p id="content-error" className="text-sm text-red-500 mt-1" role="alert">
              {errors.content}
            </p>
          )}
        </div>

        {/* Visibility Selector */}
        <fieldset>
          <legend className="block text-sm font-medium mb-2">Visibility</legend>
          <div className="flex gap-2" role="radiogroup" aria-label="Story visibility">
            {VISIBILITY_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const isSelected = visibility === opt.value;
              return (
                <MobileTooltip key={opt.value} content={opt.tooltip}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => setVisibility(opt.value)}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-md border text-sm font-medium transition-colors min-h-[44px] ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-input bg-background text-muted-foreground hover:bg-accent'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {opt.label}
                  </button>
                </MobileTooltip>
              );
            })}
          </div>
        </fieldset>

        {/* Submit Button */}
        <div className="pt-4">
          <Button
            type="submit"
            disabled={isSaving}
            className="bg-blue-500 hover:bg-blue-600 text-white min-h-[44px]"
          >
            {isSaving ? (
              <>
                <Loader2Icon className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Story'
            )}
          </Button>
        </div>
      </form>

    </div>
  );
}

export default CreateStoryPage;
