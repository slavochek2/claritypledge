import { useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import { decodeShareHash } from "./share";
import { useKnock } from "./useKnock";
import { SoundToggle } from "./parts";
import { TapperFlow } from "./TapperFlow";
import { ListenerFlow } from "./ListenerFlow";
import { FounderClose } from "./FounderClose";

/**
 * Landing lab prototype "Do". The visitor does something in the first five seconds:
 * taps a song's rhythm, guesses how many listeners would name it, then watches the
 * guess collapse to what Newton's tapper study found. A share link carries the taps
 * to a friend, who hears only the knocks (listener mode, entered from the URL hash).
 * Words are the founder's (content.ts) or visibly marked drafts (copy.ts).
 */
/** Tailwind neutral-100, the toy's surface. */
const PAGE_BG = "#f5f5f5";

export function LandingDo() {
  const { hash } = useLocation();
  const shared = useMemo(() => decodeShareHash(hash), [hash]);
  // A listen link that failed to decode still falls back to the tapper, but says so.
  const brokenLink = !shared && hash.startsWith("#listen=");
  const { knock, silence, muted, setMuted } = useKnock();

  // The page colour reaches the window's edges: the scrollbar gutter and overscroll
  // show the root element's background, which is otherwise the app's white. Restored
  // on leave; StrictMode's mount, unmount, mount runs the cleanup in between, so the
  // second mount captures the original value again, not this page's.
  useEffect(() => {
    const root = document.documentElement;
    const before = root.style.backgroundColor;
    root.style.backgroundColor = PAGE_BG;
    return () => {
      root.style.backgroundColor = before;
    };
  }, []);

  // Switching between tapper and listener is a fresh start, from the top.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [shared]);

  const toggleSound = () => {
    if (!muted) silence();
    setMuted(!muted);
  };

  return (
    <MotionConfig reducedMotion="user">
      <main className="relative min-h-screen overflow-x-clip bg-neutral-100 font-sans text-neutral-900 antialiased">
        {/* Sits with the toy at the top rather than floating over the text below it. */}
        <div className="absolute right-3 top-3 z-20 sm:right-5 sm:top-5">
          <SoundToggle muted={muted} onToggle={toggleSound} />
        </div>

        {shared ? (
          <ListenerFlow key={hash} shared={shared} knock={knock} silence={silence} />
        ) : (
          <TapperFlow knock={knock} brokenLink={brokenLink} />
        )}

        <FounderClose />
      </main>
    </MotionConfig>
  );
}
