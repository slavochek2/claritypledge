import React, { createContext, useContext, useState, ReactNode } from 'react';
import { PledgeModal } from '@/polymet/components/pledge-modal';

type ModalMode = 'sign' | 'login';

interface PledgeModalContextType {
  open: (mode?: ModalMode) => void;
  close: () => void;
  isOpen: boolean;
  mode: ModalMode;
}

const PledgeModalContext = createContext<PledgeModalContextType | undefined>(undefined);

export function usePledgeModal() {
  const context = useContext(PledgeModalContext);
  if (!context) {
    throw new Error('usePledgeModal must be used within a PledgeModalProvider');
  }
  return context;
}

interface PledgeModalProviderProps {
  children: ReactNode;
}

export function PledgeModalProvider({ children }: PledgeModalProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<ModalMode>('sign');

  const open = (newMode: ModalMode = 'sign') => {
    setMode(newMode);
    setIsOpen(true);
  };

  const close = () => {
    setIsOpen(false);
  };

  return (
    <PledgeModalContext.Provider value={{ open, close, isOpen, mode }}>
      {children}
      <PledgeModal
        open={isOpen}
        onOpenChange={(open) => (open ? setIsOpen(true) : close())}
        initialMode={mode}
      />
    </PledgeModalContext.Provider>
  );
}

