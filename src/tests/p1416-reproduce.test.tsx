/**
 * P1416 canary: an installed PWA resumed from the background after a deploy keeps running the old
 * build, because nothing checks for a new version when the app returns to the foreground.
 *
 * Symptom-level: renders the real sonner Toasters inside a router and asserts what the user sees
 * after a resume (`visibilitychange` → visible) while a newer build is live at `/`.
 */
import { render, screen, act, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, useNavigate, type NavigateFunction } from 'react-router-dom';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import {
  AppUpdatePrompt,
  APP_UPDATE_TOAST_MS,
  APP_UPDATE_OFFER_DELAY_MS,
  APP_UPDATE_TOAST_ID,
} from '@/app/components/pwa/app-update-prompt';

const MESSAGE = 'New version available, tap to refresh.';
const RUNNING_ENTRY = '/assets/index-OLDbuild.js';

const reloadMock = vi.fn();
Object.defineProperty(window, 'location', {
  value: { ...window.location, reload: reloadMock },
  writable: true,
});

function shellHtml(entry: string) {
  return `<!doctype html><html><head>
    <script type="application/ld+json">{}</script>
    <script type="module" crossorigin src="${entry}"></script>
    <script id="vite-plugin-pwa:register-sw" src="/registerSW.js" defer></script>
  </head><body><div id="root"></div></body></html>`;
}

function setVisibility(value: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value, writable: true, configurable: true });
}
function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
}

async function resume() {
  setVisibility('hidden');
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
  setVisibility('visible');
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

/** Sonner removes a dismissed toast through chained timers with renders between them. */
async function settle() {
  for (let i = 0; i < 6; i++) await advance(150);
}

/** Resume, let the check settle, then wait out the offer delay. */
async function resumeAndWaitForOffer() {
  await resume();
  await advance(50);
  await advance(APP_UPDATE_OFFER_DELAY_MS);
}

let update: ReturnType<typeof vi.fn>;
let fetchMock: ReturnType<typeof vi.fn>;
let navigate: NavigateFunction;

function CaptureNavigate() {
  navigate = useNavigate();
  return null;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  setVisibility('visible');
  setOnline(true);

  document.head.querySelectorAll('script[data-p1416]').forEach((s) => s.remove());
  const s = document.createElement('script');
  s.type = 'module';
  s.setAttribute('src', RUNNING_ENTRY);
  s.setAttribute('data-p1416', '');
  document.head.appendChild(s);

  update = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      controller: {},
      getRegistration: vi.fn().mockResolvedValue({ update }),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  });

  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  toast.dismiss();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function serve(entry: string) {
  fetchMock.mockResolvedValue(new Response(shellHtml(entry), { status: 200, headers: { 'content-type': 'text/html' } }));
}

/** The app shell: the prompt at the root, and a route layout's own shared Toaster beside it. */
function Shell({ routeToaster = true, prompt = true }: { routeToaster?: boolean; prompt?: boolean }) {
  return (
    <>
      <CaptureNavigate />
      {prompt && <AppUpdatePrompt enabled />}
      {routeToaster && <Toaster />}
    </>
  );
}

function mount(path = '/feed') {
  const ui = (props: { routeToaster?: boolean; prompt?: boolean } = {}) => (
    <MemoryRouter initialEntries={[path]}>
      <Shell {...props} />
    </MemoryRouter>
  );
  const r = render(ui());
  return { rerender: (props: { routeToaster?: boolean; prompt?: boolean }) => r.rerender(ui(props)) };
}

const ourToastIsActive = () => toast.getToasts().some((t) => t.id === APP_UPDATE_TOAST_ID);

describe('P1416: resuming the app after a deploy offers the new version', () => {
  it('shows the message on resume when a newer build is live, and asks the service worker to update', async () => {
    serve('/assets/index-NEWbuild.js');
    mount();
    await resumeAndWaitForOffer();
    expect(await screen.findByText(MESSAGE)).toBeInTheDocument();
    expect(screen.getAllByText(MESSAGE)).toHaveLength(1);
    expect(update).toHaveBeenCalled();
  });

  it('review item 2: waits before offering, so a tap meant for the page lands on the page', async () => {
    serve('/assets/index-NEWbuild.js');
    mount();
    await resume();
    await advance(APP_UPDATE_OFFER_DELAY_MS - 300);
    expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument();
    await advance(400);
    expect(await screen.findByText(MESSAGE)).toBeInTheDocument();
  });

  it('review item 2: sits at the bottom, away from the route Toaster at the top', async () => {
    serve('/assets/index-NEWbuild.js');
    mount();
    await resumeAndWaitForOffer();
    const message = await screen.findByText(MESSAGE);
    expect(message.closest('[data-sonner-toaster]')?.getAttribute('data-y-position')).toBe('bottom');
  });

  it('review item 2: never offered on /live or /transcribe; offered once the user leaves', async () => {
    serve('/assets/index-NEWbuild.js');
    mount('/live/ABC123');
    await resumeAndWaitForOffer();
    expect(fetchMock).toHaveBeenCalled();
    expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument();
    await act(async () => navigate('/transcribe'));
    await advance(APP_UPDATE_OFFER_DELAY_MS + 100);
    expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument();
    await act(async () => navigate('/feed'));
    await advance(APP_UPDATE_OFFER_DELAY_MS + 100);
    expect(await screen.findByText(MESSAGE)).toBeInTheDocument();
  });

  it('review item 2: entering /live takes a visible offer down', async () => {
    serve('/assets/index-NEWbuild.js');
    mount();
    await resumeAndWaitForOffer();
    await screen.findByText(MESSAGE);
    await act(async () => navigate('/live'));
    await settle();
    expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument();
  });

  it("survives a route change that remounts the page's Toaster, and shows on a route with none", async () => {
    serve('/assets/index-NEWbuild.js');
    const { rerender } = mount();
    await resumeAndWaitForOffer();
    await screen.findByText(MESSAGE);
    rerender({ routeToaster: false });
    expect(screen.getByText(MESSAGE)).toBeInTheDocument();
    rerender({});
    expect(screen.getAllByText(MESSAGE)).toHaveLength(1);
  });

  it('does not stay over the page: it times out, and the next resume offers it again', async () => {
    serve('/assets/index-NEWbuild.js');
    mount();
    await resumeAndWaitForOffer();
    await screen.findByText(MESSAGE);
    await advance(APP_UPDATE_TOAST_MS + 1_000);
    expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument();
    await resumeAndWaitForOffer();
    expect(await screen.findByText(MESSAGE)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1); // re-offered from memory inside the gap
  });

  it('reloads only when the message is tapped', async () => {
    serve('/assets/index-NEWbuild.js');
    mount();
    await resumeAndWaitForOffer();
    const message = await screen.findByText(MESSAGE);
    expect(reloadMock).not.toHaveBeenCalled();
    fireEvent.click(message);
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it('review item 4: a tap while offline does not reload', async () => {
    serve('/assets/index-NEWbuild.js');
    mount();
    await resumeAndWaitForOffer();
    const message = await screen.findByText(MESSAGE);
    setOnline(false); // no 'offline' event yet — the click itself must check
    fireEvent.click(message);
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it("review item 4: the 'offline' event takes the offer down", async () => {
    serve('/assets/index-NEWbuild.js');
    mount();
    await resumeAndWaitForOffer();
    await screen.findByText(MESSAGE);
    setOnline(false);
    await act(async () => {
      window.dispatchEvent(new Event('offline'));
    });
    await settle();
    expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument();
  });

  it('review item 7: unmounting the prompt dismisses its toast', async () => {
    serve('/assets/index-NEWbuild.js');
    const { rerender } = mount();
    await resumeAndWaitForOffer();
    await screen.findByText(MESSAGE);
    expect(ourToastIsActive()).toBe(true);
    rerender({ prompt: false });
    expect(ourToastIsActive()).toBe(false);
  });

  it('review item 8: inside an iframe (an embed on another site) it does nothing', async () => {
    const realTop = Object.getOwnPropertyDescriptor(window, 'top');
    Object.defineProperty(window, 'top', { value: {}, configurable: true });
    try {
      serve('/assets/index-NEWbuild.js');
      mount();
      await resumeAndWaitForOffer();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
      expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument();
    } finally {
      if (realTop) Object.defineProperty(window, 'top', realTop);
    }
  });

  it('stays silent when the live build is the one already running (first install, fresh cold start)', async () => {
    serve(RUNNING_ENTRY);
    mount();
    await resumeAndWaitForOffer();
    expect(fetchMock).toHaveBeenCalled();
    expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument();
  });

  it('stays silent offline and makes no request', async () => {
    serve('/assets/index-NEWbuild.js');
    setOnline(false);
    mount();
    await resumeAndWaitForOffer();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument();
  });

  it('stays silent when the version check request fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    mount();
    await resumeAndWaitForOffer();
    expect(fetchMock).toHaveBeenCalled();
    expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument();
    expect(reloadMock).not.toHaveBeenCalled();
  });
});
