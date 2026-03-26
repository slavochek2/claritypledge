/**
 * @file docs-list-page.tsx
 * @description P551: Clarity Docs list page — auth-gated, shows user's docs.
 * Route: /docs
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { FileText, ChevronRight, Plus, Lock, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { ClarityPageLoader } from '@/components/ui/clarity-loader';
import { Button } from '@/components/ui/button';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { useAuth } from '@/auth';
import { docsService } from '@/app/data/docs-service';
import { InlineVisibilityIcon } from '@/app/components/shared/visibility-badge';
import { formatTimeAgo } from '@/app/utils/format-time';
import type { ClarityDoc, ContentVisibility } from '@/app/types';

export function DocsListPage() {
  const navigate = useNavigate();
  const { user, isLoading, sessionChecked } = useAuth();

  const [docs, setDocs] = useState<ClarityDoc[]>([]);
  const [fetchState, setFetchState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [creating, setCreating] = useState(false);

  const fetchDocs = useCallback(async () => {
    if (!user?.id) return;
    setFetchState('loading');
    try {
      const result = await docsService.getDocsByUser(user.id);
      setDocs(result);
      setFetchState('done');
    } catch {
      toast.error('Failed to load docs');
      setFetchState('error');
    }
  }, [user?.id]);

  // Auth gate
  useEffect(() => {
    if (!sessionChecked || isLoading) return;
    if (!user) {
      navigate('/login?redirect=/docs', { replace: true });
    }
  }, [user, isLoading, sessionChecked, navigate]);

  // Fetch docs on mount
  useEffect(() => {
    if (user?.id) {
      fetchDocs();
    }
  }, [user?.id, fetchDocs]);

  const handleCreate = async (visibility: ContentVisibility) => {
    setCreating(true);
    try {
      const doc = await docsService.createDoc(visibility);
      navigate(`/d/${doc.id}`);
    } catch {
      toast.error('Failed to create doc');
      setCreating(false);
    }
  };

  // Loading state
  if (!sessionChecked || isLoading) {
    return <ClarityPageLoader />;
  }

  // Auth redirect handled by effect — render nothing while redirecting
  if (!user) {
    return null;
  }

  // Empty state
  if (fetchState === 'done' && docs.length === 0) {
    return (
      <main aria-label="Your Clarity Docs" className="min-h-screen">
        <div className="max-w-2xl mx-auto px-4 py-16 flex flex-col items-center text-center gap-4">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <FileText className="w-8 h-8 text-muted-foreground" />
          </div>
          <h1 className="text-xl font-semibold text-foreground">No Clarity Docs yet</h1>
          <p className="text-sm text-muted-foreground">
            Curate stories into collections you control.
          </p>
          <Popover>
            <PopoverTrigger asChild>
              <Button className="mt-2">
                <Plus className="w-4 h-4" />
                Create a Doc
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2">
              <button
                onClick={() => handleCreate('private')}
                disabled={creating}
                className="w-full flex items-center gap-3 rounded-md px-3 py-2.5 text-sm hover:bg-accent transition-colors text-left"
              >
                <Lock size={16} className="text-amber-600 flex-shrink-0" />
                <div>
                  <div className="font-medium">Private Doc</div>
                  <div className="text-xs text-muted-foreground">Only you can see this</div>
                </div>
              </button>
              <button
                onClick={() => handleCreate('public')}
                disabled={creating}
                className="w-full flex items-center gap-3 rounded-md px-3 py-2.5 text-sm hover:bg-accent transition-colors text-left"
              >
                <Globe size={16} className="text-muted-foreground flex-shrink-0" />
                <div>
                  <div className="font-medium">Public Doc</div>
                  <div className="text-xs text-muted-foreground">Visible on your profile</div>
                </div>
              </button>
            </PopoverContent>
          </Popover>
        </div>
      </main>
    );
  }

  return (
    <main aria-label="Your Clarity Docs" className="min-h-screen">
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-foreground">Your Clarity Docs</h1>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <Plus className="w-4 h-4" />
                New Doc
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-2">
              <button
                onClick={() => handleCreate('private')}
                disabled={creating}
                className="w-full flex items-center gap-3 rounded-md px-3 py-2.5 text-sm hover:bg-accent transition-colors text-left"
              >
                <Lock size={16} className="text-amber-600 flex-shrink-0" />
                <div>
                  <div className="font-medium">Private Doc</div>
                  <div className="text-xs text-muted-foreground">Only you can see this</div>
                </div>
              </button>
              <button
                onClick={() => handleCreate('public')}
                disabled={creating}
                className="w-full flex items-center gap-3 rounded-md px-3 py-2.5 text-sm hover:bg-accent transition-colors text-left"
              >
                <Globe size={16} className="text-muted-foreground flex-shrink-0" />
                <div>
                  <div className="font-medium">Public Doc</div>
                  <div className="text-xs text-muted-foreground">Visible on your profile</div>
                </div>
              </button>
            </PopoverContent>
          </Popover>
        </div>

        {/* Loading state for fetch */}
        {fetchState === 'loading' && (
          <div className="flex justify-center py-12">
            <ClarityPageLoader />
          </div>
        )}

        {/* Doc cards */}
        {(fetchState === 'done' || fetchState === 'error') && (
          <div className="flex flex-col gap-3">
            {docs.map((doc) => (
              <Link
                key={doc.id}
                to={`/d/${doc.id}`}
                className={`block rounded-lg border bg-card p-4 hover:bg-muted/50 transition-colors border-l-4 ${
                  doc.visibility === 'private'
                    ? 'border-l-amber-400'
                    : 'border-l-blue-500'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <InlineVisibilityIcon visibility={doc.visibility === 'public' ? 'public' : 'private'} />
                      <span className="text-sm font-medium text-foreground truncate">
                        {doc.title}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <span>
                        {doc.story_count} {doc.story_count === 1 ? 'story' : 'stories'}
                      </span>
                      <span aria-hidden="true">&middot;</span>
                      <span>Updated {formatTimeAgo(doc.updated_at)} ago</span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
