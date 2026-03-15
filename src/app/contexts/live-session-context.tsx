import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

// ─── localStorage persistence ────────────────────────────────────────────────

const STORAGE_KEY = 'cp_active_session';

export interface StoredActiveSession {
  code: string;
  partnerName: string | null;
  role: 'creator' | 'joiner';
  timestamp: string; // ISO 8601
}

/** Save active session info to localStorage. */
export function saveActiveSessionToStorage(session: StoredActiveSession): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Quota exceeded or private browsing — silently ignore
  }
}

/** Read active session info from localStorage. Returns null on missing/malformed data. */
export function getActiveSessionFromStorage(): StoredActiveSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredActiveSession;
    // Basic shape validation
    if (!parsed.code || !parsed.role || !parsed.timestamp) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Remove active session info from localStorage. */
export function clearActiveSessionFromStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
}

// ─── Context ─────────────────────────────────────────────────────────────────

interface LiveSessionContextValue {
  // Existing — kept for backward compat (consumers still reference these)
  isLive: boolean;
  setIsLive: (v: boolean) => void;
  pendingNavTo: string | null;
  setPendingNavTo: (to: string | null) => void;

  // P511: Active session state
  activeSessionCode: string | null;
  activeSessionPartnerName: string | null;
  activeSessionRole: 'creator' | 'joiner' | null;
  isGracePeriod: boolean;
  gracePeriodPartnerName: string | null;

  // P511: Methods
  setActiveSession: (code: string, partnerName: string | null, role: 'creator' | 'joiner') => void;
  clearActiveSession: () => void;
  setGracePeriod: (isGrace: boolean, partnerName?: string | null) => void;
}

const LiveSessionContext = createContext<LiveSessionContextValue>({
  isLive: false,
  setIsLive: () => {},
  pendingNavTo: null,
  setPendingNavTo: () => {},
  activeSessionCode: null,
  activeSessionPartnerName: null,
  activeSessionRole: null,
  isGracePeriod: false,
  gracePeriodPartnerName: null,
  setActiveSession: () => {},
  clearActiveSession: () => {},
  setGracePeriod: () => {},
});

export function LiveSessionProvider({ children }: { children: ReactNode }) {
  const [isLive, setIsLive] = useState(false);
  const [pendingNavTo, setPendingNavTo] = useState<string | null>(null);

  // P511: Active session tracking
  const [activeSessionCode, setActiveSessionCode] = useState<string | null>(null);
  const [activeSessionPartnerName, setActiveSessionPartnerName] = useState<string | null>(null);
  const [activeSessionRole, setActiveSessionRole] = useState<'creator' | 'joiner' | null>(null);
  const [isGracePeriod, setIsGracePeriodState] = useState(false);
  const [gracePeriodPartnerName, setGracePeriodPartnerName] = useState<string | null>(null);

  const setActiveSession = useCallback((code: string, partnerName: string | null, role: 'creator' | 'joiner') => {
    setActiveSessionCode(code);
    setActiveSessionPartnerName(partnerName);
    setActiveSessionRole(role);
    saveActiveSessionToStorage({
      code,
      partnerName,
      role,
      timestamp: new Date().toISOString(),
    });
  }, []);

  const clearActiveSession = useCallback(() => {
    setActiveSessionCode(null);
    setActiveSessionPartnerName(null);
    setActiveSessionRole(null);
    setIsGracePeriodState(false);
    setGracePeriodPartnerName(null);
    clearActiveSessionFromStorage();
  }, []);

  const setGracePeriod = useCallback((isGrace: boolean, partnerName?: string | null) => {
    setIsGracePeriodState(isGrace);
    setGracePeriodPartnerName(partnerName ?? null);
  }, []);

  return (
    <LiveSessionContext.Provider
      value={{
        isLive,
        setIsLive,
        pendingNavTo,
        setPendingNavTo,
        activeSessionCode,
        activeSessionPartnerName,
        activeSessionRole,
        isGracePeriod,
        gracePeriodPartnerName,
        setActiveSession,
        clearActiveSession,
        setGracePeriod,
      }}
    >
      {children}
    </LiveSessionContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLiveSession() {
  return useContext(LiveSessionContext);
}
