/**
 * P1536: copying the prompt for the owner's own AI. `copy` puts it on the clipboard and `copied` is true for about two
 * seconds after (the button says so); when the clipboard refuses, `showText` turns on and the same text opens in a
 * dialog to copy by hand.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { CANVAS_OWN_AI_PROMPT } from './canvas-thread-copy';

/** How long the button says "Copied". */
export const COPIED_MS = 2000;

export function useCopyPrompt() {
  const [copied, setCopied] = useState(false);
  const [showText, setShowText] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(CANVAS_OWN_AI_PROMPT);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), COPIED_MS);
    } catch {
      setShowText(true);
    }
  }, []);
  return { copy, copied, showText, setShowText };
}
