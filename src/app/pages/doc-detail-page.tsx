/**
 * @file doc-detail-page.tsx
 * @description P551: Clarity Doc detail page — shows doc header, privacy banner,
 * linked stories, and action buttons.
 * Route: /d/:docId
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { FileText, Plus, ListChecks } from 'lucide-react';
import { ClarityPageLoader } from '@/components/ui/clarity-loader';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/auth';
import { docsService } from '@/app/data/docs-service';
import { DocHeader } from '@/app/components/docs/doc-header';
import { DocPrivacyBanner } from '@/app/components/docs/doc-privacy-banner';
import { StoryCardDetail } from '@/app/components/social/StoryCardDetail';
import type { ClarityDoc, DocStory } from '@/app/types';

export function DocDetailPage() {
  const { docId } = useParams<{ docId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [doc, setDoc] = useState<ClarityDoc | null>(null);
  const [stories, setStories] = useState<DocStory[]>([]);
  const [fetchState, setFetchState] = useState<'loading' | 'done' | 'not-found'>('loading');

  const fetchDoc = useCallback(async () => {
    if (!docId) return;
    setFetchState('loading');
    try {
      const result = await docsService.getDoc(docId);
      if (!result) {
        setFetchState('not-found');
        return;
      }
      setDoc(result.doc);
      setStories(result.stories);
      setFetchState('done');
    } catch {
      setFetchState('not-found');
    }
  }, [docId]);

  useEffect(() => {
    fetchDoc();
  }, [fetchDoc]);

  const isOwner = Boolean(user?.id && doc?.owner_id === user.id);
  const hasPrivateStories = stories.some((ds) => ds.story.visibility === 'private');

  const handleDocUpdated = useCallback((updated: ClarityDoc) => {
    setDoc(updated);
  }, []);

  // Loading state
  if (fetchState === 'loading') {
    return <ClarityPageLoader />;
  }

  // Not found / unauthorized
  if (fetchState === 'not-found' || !doc) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">
            This doc doesn&apos;t exist or you don&apos;t have access.
          </p>
          <Link
            to="/docs"
            className="text-blue-600 hover:underline text-sm font-medium"
          >
            Back to Docs
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main
      aria-label={`Clarity Doc: ${doc.title}`}
      className="min-h-screen bg-background"
    >
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Header with back link, title, visibility, and overflow menu */}
        <DocHeader
          doc={doc}
          hasPrivateStories={hasPrivateStories}
          isOwner={isOwner}
          onDocUpdated={handleDocUpdated}
        />

        {/* Privacy banner */}
        <DocPrivacyBanner visibility={doc.visibility} />

        {/* Story count */}
        <p className="text-sm text-muted-foreground">
          {stories.length} {stories.length === 1 ? 'story' : 'stories'}
        </p>

        {/* Stories or empty state */}
        {stories.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
            <FileText size={48} className="text-muted-foreground/40" />
            <p className="text-lg font-medium text-foreground">Add your first story</p>
            <p className="text-sm text-muted-foreground">
              Stories bring your Clarity Doc to life. Write one or select from your existing stories.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {stories.map((docStory) => (
              <div
                key={docStory.story_id}
                role="button"
                tabIndex={0}
                onClick={() =>
                  navigate(`/story/${docStory.story_id}`, {
                    state: { docId: doc.id, docTitle: doc.title },
                  })
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(`/story/${docStory.story_id}`, {
                      state: { docId: doc.id, docTitle: doc.title },
                    });
                  }
                }}
                className="cursor-pointer"
              >
                <StoryCardDetail
                  story={docStory.story}
                  linkedPoints={[]}
                  positionCounts={new Map()}
                  userPositions={new Map()}
                  disableNavigation
                  hideActions
                />
              </div>
            ))}
          </div>
        )}

        {/* Action buttons — only for owner */}
        {isOwner && (
          <div className="flex flex-wrap gap-3 pt-2">
            <Button asChild>
              <Link to={`/create?docId=${doc.id}`}>
                <Plus size={16} />
                Write a story
              </Link>
            </Button>
            <Button variant="outline" disabled>
              <ListChecks size={16} />
              Select your story
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
