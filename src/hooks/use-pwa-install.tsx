/**
 * @file use-pwa-install.ts
 * @description P493: Core hook for PWA install prompt management.
 * Captures beforeinstallprompt, detects installed state, handles dismiss cooldown.
 */
import { useState, useEffect, useCallback, createContext, useContext, useRef, type ReactNode } from 'react';
import { analytics } from '@/lib/mixpanel';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PwaInstallContextValue {
  /** Whether the app is already installed (standalone mode) */
  isInstalled: boolean;
  /** Whether the browser supports install prompt (Android/Chrome/Edge) */
  canPrompt: boolean;
  /** Whether the device is iOS (needs manual instructions) */
  isIOS: boolean;
  /** Whether the user dismissed the prompt within the last 30 days */
  isDismissed: boolean;
  /** Whether the browser is desktop */
  isDesktop: boolean;
  /** Trigger the native install prompt (Android/Chrome) */
  promptInstall: (source: InstallSource) => Promise<void>;
  /** Record a dismiss and start 30-day cooldown */
  dismiss: (source: InstallSource) => void;
}

export type InstallSource = 'celebration' | 'session_end' | 'settings';

const DISMISS_KEY = 'pwa_install_dismissed_at';
const COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const PwaInstallContext = createContext<PwaInstallContextValue | null>(null);

function getIsIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const iOSLegacy = /iPhone|iPad|iPod/.test(navigator.userAgent) && !(window as unknown as Record<string, unknown>).MSStream;
  // iPadOS 13+ presents as desktop Safari but has touch
  const isiPadOS = /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
  return iOSLegacy || isiPadOS;
}

function getIsDesktop(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (/Android|iPhone|iPad|iPod/.test(navigator.userAgent)) return false;
  // iPadOS 13+ presents as Macintosh but has touch
  if (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1) return false;
  return true;
}

function getIsInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  // Check standalone display mode (works on all platforms)
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  // iOS standalone check
  if ((navigator as unknown as Record<string, boolean>).standalone === true) return true;
  return false;
}

function getIsDismissed(): boolean {
  try {
    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    if (!dismissedAt) return false;
    const elapsed = Date.now() - parseInt(dismissedAt, 10);
    return elapsed < COOLDOWN_MS;
  } catch {
    return false;
  }
}

export function PwaInstallProvider({ children }: { children: ReactNode }) {
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  const [canPrompt, setCanPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(getIsInstalled);
  const [isDismissed, setIsDismissed] = useState(getIsDismissed);

  const isIOS = getIsIOS();
  const isDesktop = getIsDesktop();

  // Capture the beforeinstallprompt event
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      deferredPrompt.current = e as BeforeInstallPromptEvent;
      setCanPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Listen for successful install
    const installHandler = () => {
      setIsInstalled(true);
      deferredPrompt.current = null;
      setCanPrompt(false);
    };
    window.addEventListener('appinstalled', installHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installHandler);
    };
  }, []);

  // Listen for display-mode changes (e.g., user installs via browser UI)
  useEffect(() => {
    const mq = window.matchMedia('(display-mode: standalone)');
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) setIsInstalled(true);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const promptInstall = useCallback(async (source: InstallSource) => {
    if (deferredPrompt.current) {
      await deferredPrompt.current.prompt();
      const { outcome } = await deferredPrompt.current.userChoice;
      if (outcome === 'accepted') {
        analytics.track('pwa_install_accepted', { source });
        setIsInstalled(true);
      } else {
        analytics.track('pwa_install_dismissed', { source, via: 'native_prompt' });
      }
      deferredPrompt.current = null;
      setCanPrompt(false);
    }
  }, []);

  const dismiss = useCallback((source: InstallSource) => {
    analytics.track('pwa_install_dismissed', { source });
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch { /* localStorage full — ignore */ }
    setIsDismissed(true);
  }, []);

  return (
    <PwaInstallContext.Provider
      value={{ isInstalled, canPrompt, isIOS, isDismissed, isDesktop, promptInstall, dismiss }}
    >
      {children}
    </PwaInstallContext.Provider>
  );
}

export function usePwaInstall(): PwaInstallContextValue {
  const ctx = useContext(PwaInstallContext);
  if (!ctx) {
    throw new Error('usePwaInstall must be used within PwaInstallProvider');
  }
  return ctx;
}
