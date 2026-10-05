/**
 * @file app-update-prompt.tsx
 * @description P1416: offers the new version when a newer build is live than the one this page is
 * running (src/lib/app-update-check.ts). A toast the user taps to reload — never a silent reload,
 * which could lose a half-typed story.
 *
 * It has its own Toaster (sonner `id` / `toasterId`), mounted once at the app root: the shared
 * Toaster lives inside each route's layout and remounts with an empty list on navigation, which
 * would drop the prompt, and some routes render none at all. Default Toasters ignore toasts that
 * carry a `toasterId`, so nothing shows twice. It sits at the bottom, above the bottom nav, so it
 * never overlaps the route Toaster at the top.
 *
 * Never on /live or /transcribe (a reload there would end the room), never offline, never inside an
 * iframe (an embed on someone else's site), and only after a short delay following the resume, so
 * a tap aimed at the page does not land on it.
 */
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import { startAppUpdateWatcher } from '@/lib/app-update-check';

/** [FOUNDER DECISION 2026-10-05] copy approved verbatim. */
export const APP_UPDATE_MESSAGE = 'New version available, tap to refresh.';
const TOASTER_ID = 'app-update';
/** Stable id: re-offering updates the one toast instead of stacking copies. */
export const APP_UPDATE_TOAST_ID = 'app-update-available';
/**
 * Not permanent: on a phone it covers part of the page. Sonner pauses the timer while the app is in
 * the background, and the watcher re-offers it on resume while the update is pending.
 */
export const APP_UPDATE_TOAST_MS = 15_000;
/** Wait after a resume before offering, so a tap meant for the page does not land on the toast. */
export const APP_UPDATE_OFFER_DELAY_MS = 1_500;
/** Clear of the mobile bottom nav (h-16) plus the home-indicator inset. */
const BOTTOM_OFFSET = { bottom: 'calc(5rem + env(safe-area-inset-bottom))' };

/** Same set as the layout's isLivePage (clarity-landing-layout.tsx). */
function isLiveRoute(pathname: string): boolean {
  return /^\/(live|transcribe)(\/|$)/.test(pathname);
}

function isEmbedded(): boolean {
  try {
    return window.top !== window;
  } catch {
    return true; // cross-origin parent
  }
}

function reloadIfOnline() {
  if (navigator.onLine === false) {
    toast.dismiss(APP_UPDATE_TOAST_ID); // the reload would boot the old precached shell
    return;
  }
  window.location.reload();
}

function showToast() {
  toast.custom(
    () => (
      <button
        type="button"
        onClick={reloadIfOnline}
        className="flex w-full min-h-12 items-center gap-3 rounded-lg border border-blue-200 bg-white px-4 py-3 text-left text-sm font-medium text-gray-900 shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
      >
        <RefreshCw className="h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />
        <span>{APP_UPDATE_MESSAGE}</span>
      </button>
    ),
    { id: APP_UPDATE_TOAST_ID, toasterId: TOASTER_ID, duration: APP_UPDATE_TOAST_MS },
  );
}

/** `enabled` defaults to production builds only: the dev server has no built entry to compare. */
export function AppUpdatePrompt({ enabled = import.meta.env.PROD }: { enabled?: boolean }) {
  const { pathname } = useLocation();
  const active = enabled && !isEmbedded();
  const pathRef = useRef(pathname);
  const pendingRef = useRef(false);
  const offerSoonRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const clearTimer = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    };
    const offerSoon = () => {
      pendingRef.current = true;
      clearTimer();
      timer = setTimeout(() => {
        timer = undefined;
        if (!pendingRef.current || navigator.onLine === false || isLiveRoute(pathRef.current)) return;
        showToast();
      }, APP_UPDATE_OFFER_DELAY_MS);
    };
    const hide = () => {
      pendingRef.current = false;
      clearTimer();
      toast.dismiss(APP_UPDATE_TOAST_ID);
    };
    offerSoonRef.current = offerSoon;
    const stop = startAppUpdateWatcher({ onUpdateAvailable: offerSoon, onUpdateHidden: hide });
    return () => {
      stop();
      clearTimer();
      offerSoonRef.current = null;
      toast.dismiss(APP_UPDATE_TOAST_ID);
    };
  }, [active]);

  // Entering a live room takes the offer down; leaving one offers a pending update.
  useEffect(() => {
    const wasLive = isLiveRoute(pathRef.current);
    pathRef.current = pathname;
    if (!active) return;
    if (isLiveRoute(pathname)) toast.dismiss(APP_UPDATE_TOAST_ID);
    else if (wasLive && pendingRef.current) offerSoonRef.current?.();
  }, [pathname, active]);

  if (!active) return null;
  // The shared wrapper gives the styling hooks; its toast classNames are replaced because the button
  // below is the whole toast surface.
  return (
    <Toaster
      id={TOASTER_ID}
      position="bottom-center"
      offset={BOTTOM_OFFSET}
      mobileOffset={BOTTOM_OFFSET}
      closeButton={false}
      toastOptions={{ className: 'w-full' }}
    />
  );
}
