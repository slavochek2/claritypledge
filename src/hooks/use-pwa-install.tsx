/**
 * @file use-pwa-install.ts
 * @description P493: Core hook for PWA install prompt management.
 * Captures beforeinstallprompt, detects installed state, handles dismiss cooldown.
 */
import { useState, useEffect, useCallback, createContext, useContext, useRef, type ReactNode } from 'react';
import { analytics } from '@/lib/mixpanel';
import { IosInstallDrawer } from '@/app/components/pwa/ios-install-drawer';

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
  /** P1593: whether an install action exists here (true whenever the app is not installed; founder call, no longer gated on a captured prompt) */
  canOffer: boolean;
  /** P1593: the native prompt if captured, else the iOS or generic instruction drawer (mounted once, here) */
  openInstall: (source: InstallSource) => Promise<void>;
  /** P1593: 2nd or later visit on this device (a visit = 30+ minutes since the last activity) */
  isReturnVisit: boolean;
}

export type InstallSource = 'avatar_menu' | 'return_nudge';

const DISMISS_KEY = 'pwa_install_dismissed_at';
const COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
// P1593: visit counting. A visit starts when 30+ minutes have passed since the last recorded activity.
const VISIT_COUNT_KEY = 'pwa_visit_count';
const LAST_ACTIVITY_KEY = 'pwa_last_activity_at';
const VISIT_GAP_MS = 30 * 60 * 1000;

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

/**
 * Stamps activity and returns the visit count; reloads and route changes inside a visit leave it alone.
 * `countVisit: false` only refreshes the timestamp (used when the page is hidden, so a long visit is never split).
 */
// eslint-disable-next-line react-refresh/only-export-components
export function recordActivity(now = Date.now(), countVisit = true): number {
  try {
    const last = parseInt(localStorage.getItem(LAST_ACTIVITY_KEY) ?? '', 10);
    let count = parseInt(localStorage.getItem(VISIT_COUNT_KEY) ?? '', 10);
    if (!Number.isFinite(count)) count = 0;
    if (countVisit && (!Number.isFinite(last) || now - last >= VISIT_GAP_MS)) {
      count += 1;
      localStorage.setItem(VISIT_COUNT_KEY, String(count));
    }
    localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
    return count;
  } catch {
    return 0; // storage unavailable: never count a return visit
  }
}

export function PwaInstallProvider({ children }: { children: ReactNode }) {
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  const [canPrompt, setCanPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(getIsInstalled);
  const [isDismissed, setIsDismissed] = useState(getIsDismissed);
  const [instructions, setInstructions] = useState<'ios' | 'generic' | null>(null);
  const [visitCount, setVisitCount] = useState(() => recordActivity());

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

  // P1593: stamp activity when the app is left or returned to, so a gap of 30+ minutes starts a new visit.
  useEffect(() => {
    const onVisibility = () =>
      setVisitCount(recordActivity(Date.now(), document.visibilityState !== 'hidden'));
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
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

  const canOffer = !isInstalled;

  const openInstall = useCallback(async (source: InstallSource) => {
    analytics.track('pwa_install_prompted', { source });
    if (deferredPrompt.current) {
      await promptInstall(source);
    } else if (isIOS) {
      analytics.track('pwa_ios_instructions_shown', { source });
      setInstructions('ios');
    } else {
      analytics.track('pwa_install_instructions_shown', { source });
      setInstructions('generic');
    }
  }, [isIOS, promptInstall]);

  return (
    <PwaInstallContext.Provider
      value={{
        isInstalled, canPrompt, isIOS, isDismissed, isDesktop, promptInstall, dismiss,
        canOffer, openInstall, isReturnVisit: visitCount >= 2,
      }}
    >
      {children}
      <IosInstallDrawer open={instructions !== null} variant={instructions ?? 'generic'} onClose={() => setInstructions(null)} />
    </PwaInstallContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePwaInstall(): PwaInstallContextValue {
  const ctx = useContext(PwaInstallContext);
  if (!ctx) {
    throw new Error('usePwaInstall must be used within PwaInstallProvider');
  }
  return ctx;
}

/**
 * P1593: the avatar menus' "Add to home screen" item. Returns the action, or null when there is none
 * to offer (installed; non-iOS without a captured prompt) or no provider is mounted.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useInstallMenuAction(): (() => void) | null {
  const ctx = useContext(PwaInstallContext);
  if (!ctx || !ctx.canOffer) return null;
  return () => { void ctx.openInstall('avatar_menu'); };
}

/** P1593: return-visit nudge rules (mobile only; the bottom bar adds "no today's event"). False with no provider. */
// eslint-disable-next-line react-refresh/only-export-components
export function useInstallNudgeVisible(): boolean {
  const ctx = useContext(PwaInstallContext);
  return !!ctx && !ctx.isDesktop && ctx.canOffer && !ctx.isDismissed && ctx.isReturnVisit;
}
