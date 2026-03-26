/**
 * @file use-doc-context.ts
 * @description P551: Hook to read doc context from URL search params for create-story flow.
 * When ?docId= is present, fetches doc metadata and provides visibility/navigation context.
 */

import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { docsService } from '@/app/data/docs-service';
import type { ContentVisibility } from '@/app/types';

interface DocContext {
  docId: string | null;
  docTitle: string;
  docVisibility: ContentVisibility | null;
  isDocContext: boolean;
  isLoading: boolean;
  backPath: string;
}

export function useDocContext(): DocContext {
  const [searchParams] = useSearchParams();
  const docId = searchParams.get('docId');

  const [docTitle, setDocTitle] = useState('');
  const [docVisibility, setDocVisibility] = useState<ContentVisibility | null>(null);
  const [isLoading, setIsLoading] = useState(!!docId);

  useEffect(() => {
    if (!docId) return;

    let cancelled = false;
    setIsLoading(true);

    docsService.getDoc(docId).then((result) => {
      if (cancelled) return;
      if (result) {
        setDocTitle(result.doc.title);
        setDocVisibility(result.doc.visibility);
      }
      setIsLoading(false);
    }).catch(() => {
      if (!cancelled) setIsLoading(false);
    });

    return () => { cancelled = true; };
  }, [docId]);

  return {
    docId,
    docTitle,
    docVisibility,
    isDocContext: !!docId,
    isLoading,
    backPath: docId ? `/d/${docId}` : '/',
  };
}
