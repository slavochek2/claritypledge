/**
 * @file use-escape-back.ts
 * @description Escape returns to the previous view. Shared by the sessions page's transcript views
 * (split out of my-sessions-page.tsx, P1586).
 */
import { useEffect } from 'react';

export function useEscapeBack(onBack: () => void) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onBack();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onBack]);
}
