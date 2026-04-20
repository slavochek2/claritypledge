import { useLiveSession } from '@/app/contexts/live-session-context';
import { completeClaritySession } from '@/app/data/api';

export function clearSessionStorage(): void {
  if (typeof window === 'undefined') return;
  const keysToRemove: string[] = [];
  for (let i = 0; i < window.sessionStorage.length; i++) {
    const key = window.sessionStorage.key(i);
    if (key?.startsWith('clarity_live_')) keysToRemove.push(key);
  }
  keysToRemove.forEach((k) => window.sessionStorage.removeItem(k));
}

export async function terminateSessionDb(sessionId: string): Promise<void> {
  await completeClaritySession(sessionId);
}

export function useTerminateSession(): (sessionId: string) => Promise<void> {
  const { clearActiveSession } = useLiveSession();
  return async (sessionId: string) => {
    await terminateSessionDb(sessionId);
    clearSessionStorage();
    clearActiveSession();
  };
}
