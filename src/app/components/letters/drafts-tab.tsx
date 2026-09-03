/**
 * @file drafts-tab.tsx
 * @description P660: Drafts tab — editing workspace (replaces "Docs" list).
 * Shows user's drafts with [Edit Draft] and [Send as Letter] actions.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Plus, Lock, Globe, MoreHorizontal, Trash2, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { ClarityLoader } from '@/components/ui/clarity-loader';
import { Button } from '@/components/ui/button';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { docsService } from '@/app/data/docs-service';
import { InlineVisibilityIcon } from '@/app/components/shared/visibility-badge';
import { formatTimeAgo } from '@/app/utils/format-time';

import type { ClarityDoc, ContentVisibility } from '@/app/types';

interface DraftsTabProps {
  userId: string;
}

export function DraftsTab({ userId }: DraftsTabProps) {
  const navigate = useNavigate();
  const [docs, setDocs] = useState<ClarityDoc[]>([]);
  const [fetchState, setFetchState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ClarityDoc | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchDocs = useCallback(async () => {
    setFetchState('loading');
    try {
      const result = await docsService.getDocsByUser(userId);
      setDocs(result);
      setFetchState('done');
    } catch {
      toast.error('Failed to load drafts');
      setFetchState('error');
    }
  }, [userId]);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  const handleCreate = async (visibility: ContentVisibility) => {
    setCreating(true);
    try {
      const doc = await docsService.createDoc(visibility);
      navigate(`/letters/drafts/${doc.id}`);
    } catch {
      toast.error("Couldn't create draft.");
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await docsService.deleteDoc(deleteTarget.id);
      toast.success('Draft deleted');
      setDeleteTarget(null);
      fetchDocs();
    } catch (err) {
      if (err instanceof Error && err.message === 'SEALED_LETTERS_EXIST') {
        toast.error("Can't delete — letters were sent from this draft.");
      } else {
        toast.error("Couldn't delete draft.");
      }
    } finally {
      setDeleting(false);
    }
  };

  if (fetchState === 'loading') {
    return (
      <div className="flex justify-center py-12">
        <ClarityLoader size="lg" />
      </div>
    );
  }

  if (fetchState === 'error') {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
        <p className="text-sm text-muted-foreground">Something went wrong loading your drafts.</p>
        <Button variant="outline" size="sm" onClick={fetchDocs}>
          Retry
        </Button>
      </div>
    );
  }

  if (fetchState === 'done' && docs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
          <FileText className="w-8 h-8 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">No drafts yet.</p>
        <Popover>
          <PopoverTrigger asChild>
            <Button className="bg-blue-500 hover:bg-blue-600 text-white">
              <Plus className="w-4 h-4" />
              New Draft
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2">
            <CreateDocOptions onSelect={handleCreate} disabled={creating} />
          </PopoverContent>
        </Popover>
      </div>
    );
  }

  return (
    <>
      {/* Draft list */}
      <div className="flex flex-col gap-3">
        {docs.map((doc) => (
          <div
            key={doc.id}
            role="button"
            tabIndex={0}
            onClick={() => navigate(`/letters/drafts/${doc.id}`)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/letters/drafts/${doc.id}`); } }}
            className={`rounded-lg border bg-card p-4 hover:bg-accent/50 transition-colors border-l-4 cursor-pointer ${
              doc.visibility === 'private' ? 'border-l-gray-400' : 'border-l-blue-500'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <InlineVisibilityIcon visibility={doc.visibility === 'public' ? 'public' : 'private'} />
                  <span className="text-sm font-medium text-foreground line-clamp-2">
                    {doc.title}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                  <span>
                    {doc.story_count} {doc.story_count === 1 ? 'story' : 'stories'} &middot; {doc.point_count} {doc.point_count === 1 ? 'point' : 'points'}
                  </span>
                  <span aria-hidden="true">&middot;</span>
                  <span>Updated {formatTimeAgo(doc.updated_at)} ago</span>
                </div>
              </div>
              {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- stopPropagation wrapper, not interactive */}
              <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 min-h-11"
                      aria-label={`Actions for ${doc.title}`}
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      disabled={doc.has_sent_letters}
                      className={doc.has_sent_letters
                        ? 'text-muted-foreground flex-col items-start gap-0.5'
                        : 'text-destructive focus:text-destructive'}
                      onClick={() => { if (!doc.has_sent_letters) setDeleteTarget(doc); }}
                    >
                      <span className="flex items-center gap-2">
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </span>
                      {doc.has_sent_letters && (
                        <span className="text-xs text-muted-foreground pl-6">
                          Can't delete — letters were sent from this draft.
                        </span>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="sm:hidden"
                      disabled={doc.story_count === 0}
                      onClick={() => navigate(`/letter/${doc.id}/compose`)}
                    >
                      <Mail className="w-4 h-4" />
                      Prepare Letter
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  variant="ghost"
                  size="sm"
                  className="hidden sm:inline-flex text-blue-500 hover:text-blue-600 min-h-11"
                  onClick={(e) => { e.stopPropagation(); navigate(`/letters/drafts/${doc.id}`); }}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  className="hidden sm:inline-flex bg-blue-500 hover:bg-blue-600 text-white min-h-11"
                  disabled={doc.story_count === 0}
                  title={doc.story_count === 0 ? 'Add at least one story first.' : undefined}
                  onClick={(e) => { e.stopPropagation(); navigate(`/letter/${doc.id}/compose`); }}
                >
                  <Mail className="w-4 h-4 mr-1" />
                  Prepare Letter
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete draft</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{deleteTarget?.title}&rdquo;? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Shared popover options for creating a new doc
function CreateDocOptions({ onSelect, disabled }: { onSelect: (v: ContentVisibility) => void; disabled: boolean }) {
  return (
    <>
      <button
        onClick={() => onSelect('private')}
        disabled={disabled}
        className="w-full flex items-center gap-3 rounded-md px-3 py-2.5 text-sm hover:bg-accent transition-colors text-left"
      >
        <Lock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <div>
          <div className="font-medium">Private Draft</div>
          <div className="text-xs text-muted-foreground">Only people you share with can see this</div>
        </div>
      </button>
      <button
        onClick={() => onSelect('public')}
        disabled={disabled}
        className="w-full flex items-center gap-3 rounded-md px-3 py-2.5 text-sm hover:bg-accent transition-colors text-left"
      >
        <Globe className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <div>
          <div className="font-medium">Public Draft</div>
          <div className="text-xs text-muted-foreground">Visible on your profile</div>
        </div>
      </button>
    </>
  );
}
