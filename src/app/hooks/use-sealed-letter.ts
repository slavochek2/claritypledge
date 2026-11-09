/**
 * @file use-sealed-letter.ts
 * @description P1650: what the letter compose page keeps once a letter is sealed: its id (for the confirmation's link)
 * and the recipients whose letter card was not posted to chat. `sealed` spreads straight onto LetterSealConfirmation.
 */
import { useCallback, useState } from 'react';

export function useSealedLetter() {
  const [sealed, setSealed] = useState<{ letterId: string | undefined; notInChat: { name: string }[] }>({ letterId: undefined, notInChat: [] });
  // Stable (setSealed is), so it can sit in a callback's dependency list without re-creating it.
  const markSealed = useCallback((letterId: string, notInChat?: { name: string }[]) => setSealed({ letterId, notInChat: notInChat ?? [] }), []);
  return { sealed, markSealed };
}
