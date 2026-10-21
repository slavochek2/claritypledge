/**
 * @file loader-context.ts
 * @description P1539: tells ClarityPageLoader whether it renders inside the signed-in shell.
 * The shell's <main> provides `true`; everywhere else (boot, public and focus pages) stays
 * full-viewport. A .ts file so the context does not break Fast Refresh in the component file.
 */
import { createContext, useContext } from 'react';

export const InShellContentContext = createContext(false);

export function useInShellContent(): boolean {
  return useContext(InShellContentContext);
}
