/**
 * @file docs-list-page.tsx
 * @description P551: Clarity Docs list page — auth-gated, shows user's docs.
 * Route: /docs
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { FileText, ChevronRight, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { ClarityPageLoader } from '@/components/ui/clarity-loader';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/auth';
import { docsService } from '@/app/data/docs-service';
import { InlineVisibilityIcon } from '@/app/components/shared/visibility-badge';
import { formatTimeAgo } from '@/app/utils/format-time';
import type { ClarityDoc } from '@/app/types';

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

  const handleCreate = async () => {
    setCreating(true);
    try {
      const doc = await docsService.createDoc();
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
          <Button onClick={handleCreate} disabled={creating} className="mt-2">
            {creating ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Plus className="w-4 h-4 mr-2" />
            )}
            Create a Doc
          </Button>
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
          <Button variant="outline" size="sm" onClick={handleCreate} disabled={creating}>
            {creating ? (
              <Loader2 className="w-4 h-4 animate-spin mr-1" />
            ) : (
              <Plus className="w-4 h-4 mr-1" />
            )}
            New Doc
          </Button>
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
