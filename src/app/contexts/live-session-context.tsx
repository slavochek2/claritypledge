import { createContext, useContext, useState, ReactNode } from 'react';

interface LiveSessionContextValue {
  isLive: boolean;
  setIsLive: (v: boolean) => void;
  pendingNavTo: string | null;
  setPendingNavTo: (to: string | null) => void;
}

const LiveSessionContext = createContext<LiveSessionContextValue>({
  isLive: false,
  setIsLive: () => {},
  pendingNavTo: null,
  setPendingNavTo: () => {},
});

export function LiveSessionProvider({ children }: { children: ReactNode }) {
  const [isLive, setIsLive] = useState(false);
  const [pendingNavTo, setPendingNavTo] = useState<string | null>(null);

  return (
    <LiveSessionContext.Provider value={{ isLive, setIsLive, pendingNavTo, setPendingNavTo }}>
      {children}
    </LiveSessionContext.Provider>
  );
}

export function useLiveSession() {
  return useContext(LiveSessionContext);
}
