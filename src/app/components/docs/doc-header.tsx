/**
 * @file doc-header.tsx
 * @description P551: Doc detail page header — back link, inline title editing,
 * visibility dropdown, and overflow menu with delete.
 */

import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Lock, Globe, MoreHorizontal, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { docsService } from '@/app/data/docs-service';
import type { ClarityDoc } from '@/app/types';

interface DocHeaderProps {
  doc: ClarityDoc;
  /** Whether current user is the doc owner */
  isOwner: boolean;
  /** Callback after doc is updated (title or visibility) */
  onDocUpdated: (updated: ClarityDoc) => void;
}

export function DocHeader({ doc, isOwner, onDocUpdated }: DocHeaderProps) {
  const navigate = useNavigate();
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(doc.title);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleTitleClick = useCallback(() => {
    if (!isOwner) return;
    setTitleValue(doc.title);
    setIsEditingTitle(true);
    // Auto-focus happens via the input's autoFocus prop
  }, [isOwner, doc.title]);

  const saveTitle = useCallback(async () => {
    setIsEditingTitle(false);
    const trimmed = titleValue.trim();
    const finalTitle = trimmed || 'Untitled Doc';

    if (finalTitle === doc.title) return;

    try {
      const updated = await docsService.updateDoc(doc.id, { title: finalTitle });
      onDocUpdated(updated);
    } catch {
      toast.error('Failed to update title');
      setTitleValue(doc.title);
    }
  }, [titleValue, doc.id, doc.title, onDocUpdated]);

  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveTitle();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setTitleValue(doc.title);
        setIsEditingTitle(false);
      }
    },
    [saveTitle, doc.title]
  );

  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      await docsService.deleteDoc(doc.id);
      toast.success('Doc deleted');
      navigate('/docs');
    } catch {
      toast.error('Failed to delete doc');
      setIsDeleting(false);
      setDeleteDialogOpen(false);
    }
  }, [doc.id, navigate]);

  return (
    <div className="space-y-3">
      {/* Back link */}
      <button
        onClick={() => navigate('/docs')}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft size={16} />
        <span>Docs</span>
      </button>

      {/* Title + controls row */}
      <div className="flex items-start justify-between gap-3">
        {/* Title */}
        <div className="flex-1 min-w-0">
          {isEditingTitle ? (
            <input
              ref={inputRef}
              type="text"
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={handleTitleKeyDown}
              maxLength={100}
              autoFocus
              className="w-full text-2xl font-bold bg-transparent border-b-2 border-blue-500 outline-none py-1 text-foreground"
              aria-label="Edit doc title"
            />
          ) : isOwner ? (
            <button
              type="button"
              className="text-2xl font-bold text-foreground cursor-pointer hover:text-blue-600 transition-colors text-left"
              onClick={handleTitleClick}
              aria-label={`Edit title: ${doc.title}`}
            >
              {doc.title}
            </button>
          ) : (
            <h1 className="text-2xl font-bold text-foreground">
              {doc.title}
            </h1>
          )}
        </div>

        {/* Controls — only for owner */}
        {isOwner && (
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Visibility badge (static) */}
            <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground px-2 py-1">
              {doc.visibility === 'private' ? (
                <Lock size={14} className="text-amber-600" />
              ) : (
                <Globe size={14} />
              )}
              <span className="capitalize">{doc.visibility}</span>
            </span>

            {/* Overflow menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="More options">
                  <MoreHorizontal size={16} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => setDeleteDialogOpen(true)}
                  className="text-red-600 focus:text-red-600 gap-2"
                >
                  <Trash2 size={14} />
                  <span>Delete this Clarity Doc</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent hideCloseButton>
          <DialogHeader>
            <DialogTitle>Delete this Clarity Doc?</DialogTitle>
            <DialogDescription>
              This will permanently delete &ldquo;{doc.title}&rdquo; and remove all story links.
              The stories themselves will not be deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
