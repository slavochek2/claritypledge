/**
 * @file doc-header.tsx
 * @description P551: Doc detail page header — back link, inline title editing,
 * and action button slot (children).
 */

import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { docsService } from '@/app/data/docs-service';
import type { ClarityDoc } from '@/app/types';

interface DocHeaderProps {
  doc: ClarityDoc;
  /** Whether current user is the doc owner */
  isOwner: boolean;
  /** Callback after doc is updated (title or visibility) */
  onDocUpdated: (updated: ClarityDoc) => void;
  /** Action buttons rendered top-right next to title */
  children?: React.ReactNode;
}

export function DocHeader({ doc, isOwner, onDocUpdated, children }: DocHeaderProps) {
  const navigate = useNavigate();
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(doc.title);
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

  return (
    <div className="space-y-3">
      {/* Back link */}
      <button
        onClick={() => navigate('/letters?tab=drafts')}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Letters</span>
      </button>

      {/* Title + action buttons row */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
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

        {/* Action buttons — passed as children */}
        {children}
      </div>
    </div>
  );
}
