/**
 * @file p1586-loading-states-guard.test.ts
 * @description P1586 §5 — a guard that finds loading states nobody listed. Every wait in src/
 * is one of four states (spec §1): the page loader, a section skeleton, an operation label or
 * small spinner inside a control, or an optional section that renders nothing. This test scans
 * the source tree (never a hand-kept list of files) and fails on a fifth look:
 *
 *   1. large-clarity-loader — `<ClarityLoader>` whose size is not the literal "sm" (the default
 *      is "md", so a bare `<ClarityLoader />` counts) outside clarity-loader.tsx and
 *      iframe-load-overlay.tsx (P1023, a cross-origin embed with no paint signal). An aliased
 *      import (`import { ClarityLoader as Mark }`) is followed.
 *   2. loading-text — "Loading" as visible JSX text, or a "Loading…" string / template literal
 *      rendered through a JSX expression (`{x ? 'Loading…' : 'Show more'}`, `{`Loading ${kind}…`}`).
 *      The capitalised word counts anywhere; a lowercase one counts when it opens the text
 *      ("loading events…"). Not counted: attributes (aria-label, label=), text under an `sr-only`
 *      element, comments, strings outside JSX (the overlay's `label:` props, lib/chunk-error.ts),
 *      prose with the word mid-sentence ("Something went wrong loading your drafts"), and a bare
 *      `'loading'` string (a status value). The AST sees only what is rendered.
 *      KNOWN LIMITATION: `const MSG = 'Loading…'` rendered later as `{MSG}` is not seen. The string is
 *      outside JSX where it is declared, and following it to where it renders needs data-flow
 *      analysis. Pinned by a control below so the gap is a stated one.
 *   3. loose-spinner — an element that is `Loader2` / `Loader2Icon` (any non-import reference to
 *      the identifier, under any import alias) or carries `animate-spin` / `animate-[spin…]` and has
 *      no control around it. HEURISTIC, since a regex cannot know what a component is: "a control" =
 *      any ancestor-or-self JSX element whose tag is button, a, input, textarea, select, Link,
 *      NavLink, Input, Textarea, SelectTrigger, anything ending in `Button`, or that has
 *      role="button" / role="menuitem". `icon={Loader2}` on a Button therefore passes. An
 *      `animate-spin` string with no JSX element around it fails (a spinner class stored in a
 *      constant escapes the control check, so it has to be explained).
 *   4. null-while-loading — a ROUTED component renders nothing: `return null` under ANY guard
 *      (or none), or `return flag ? null : ...`. Parentheses are unwrapped (`return (null)`, a
 *      parenthesised null arm), and a concise arrow body counts (`const Page = () => null`). Every loading-flag spelling is covered by
 *      construction (`loading`, `arrivalGate === null`, `!ready`, `!event`, `navigate(); return null`)
 *      because the flag is not inspected. A genuine "nothing to show" (a signed-out redirect that runs
 *      in an effect, an unreachable fall-through) is not a wait, and says so in the allowlist.
 *      "Routed" is derived from every file that renders `<Route element={...}>` (App.tsx and any
 *      nested `<Routes>`, e.g. prototypes/events/index.tsx) plus the lazy() pages of the route arrays
 *      in src/app/routes/: component names inside an `element` are resolved through the file's
 *      imports (`@/…` and relative) and `lazy(() => import(...))` consts to a file and an export name;
 *      a component declared in the route file itself is routed there. Only the function with that
 *      name is checked (a file's helper components are not routed).
 *   5. animate-pulse — `animate-pulse` / `animate-[pulse…]` (not `animate-pulse-subtle-green`) in
 *      any string or JSX text outside src/components/ui/skeleton.tsx, the shared primitive.
 *   6. page-loader-in-frame — `<ClarityPageLoader />` (or ClarityContentLoader / ClarityBootLoader,
 *      under any alias) nested inside another JSX element or an attribute value. The page loader is
 *      a page gate (decisions.md 2026-04-11): it may only be (part of) a component's whole return,
 *      as an early return, a ternary arm, a bare arrow body or inside a fragment whose other children
 *      draw nothing (a redirect, another loader, whitespace). A fragment with a drawn sibling is a
 *      frame. Not frames: the loader's own `<ClarityPageLoader></ClarityPageLoader>` element, and
 *      the `fallback` of a `<Suspense>` (Suspense paints nothing itself; where the Suspense sits is
 *      judged instead). A frame that draws nothing (a Back-only header, a bare wrapper) is
 *      allowlisted with that reason.
 *
 * The scan is the AST (same approach as p1364-back-drift-guard), so comments never count. Test
 * files and src/tests are excluded. Everything under src/app/prototypes/events/ is scanned.
 *
 * Members are derived: the file list comes from walking src/, the routed set from the route files.
 * The hand-kept parts are only the two exclusion lists and the ALLOWLIST. An ALLOWLIST entry carries
 * the exact COUNT of each kind it excuses in that file, so one more occurrence fails the scan and
 * one fewer fails the stale check; each entry must name its reason. The first describe blocks run
 * each detector on known-bad and known-good snippets, and the route derivation on a scratch tree.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import ts from 'typescript';

type Kind =
  | 'large-clarity-loader'
  | 'loading-text'
  | 'loose-spinner'
  | 'null-while-loading'
  | 'animate-pulse'
  | 'page-loader-in-frame';

interface Finding {
  kind: Kind;
  line: number;
  text: string;
}

/** Files that ARE the standard: the detector does not apply to them. */
const STANDARD_FILES: Record<string, string> = {
  'src/components/ui/clarity-loader.tsx': 'The mark and the one page loader: the only place a large ClarityLoader is drawn.',
  'src/components/ui/iframe-load-overlay.tsx':
    'P1023: a cross-origin embed with no paint signal keeps its own large mark and labelled overlay (spec §2 "Kept, its own rule").',
  'src/components/ui/skeleton.tsx': 'The shared skeleton primitive: the one place animate-pulse is written.',
};

/** Demo-only routes are not product loading states. Each path is named with its reason. */
const EXCLUDED_DEMOS: Record<string, string> = {
  'src/app/pages/loading-demo-page.tsx':
    'The /loading-demo gallery of loader variants: it exists to show look-alikes of every look, so it carries all of them on purpose.',
};

/** Each entry is a deliberate exception; the reason is part of the contract. */
const ALLOWLIST: Record<string, { counts: Partial<Record<Kind, number>>; why: string }> = {
  // --- Status indicators: a live dot, a waiting-for-partner line, a typing indicator. Not a page or section wait. ---
  'src/app/components/letters/explain-back-capture.tsx': {
    counts: { 'animate-pulse': 1 },
    why: 'Status indicator: the red recording dot while the explain-back is being captured.',
  },
  'src/app/components/partners/transcription-input.tsx': {
    counts: { 'animate-pulse': 1 },
    why: 'Status indicator: the red recording dot while speech is being transcribed.',
  },
  'src/app/components/session/session-bar.tsx': {
    counts: { 'animate-pulse': 1 },
    why: 'Status indicator: the live-session dot (motion-safe only).',
  },
  'src/app/prototypes/event-transcription/TranscriptionBar.tsx': {
    counts: { 'animate-pulse': 1 },
    why: 'Status indicator: the live-transcription dot (motion-safe only).',
  },
  'src/app/components/partners/live-mode-view.tsx': {
    counts: { 'animate-pulse': 2 },
    why: 'Status indicator: live dots on the waiting-for-partner lines of a running session.',
  },
  'src/app/components/partners/free-mode-success.tsx': {
    counts: { 'animate-pulse': 1 },
    why: 'Status indicator: dot beside "Waiting for <partner> to continue…" after a finished exchange.',
  },
  'src/app/components/partners/free-mode-view.tsx': {
    counts: { 'animate-pulse': 1 },
    why: 'Celebration, not a wait: the "Both at 10" line pulses once both partners reach 10.',
  },
  'src/app/components/shared/RatingDots.tsx': {
    counts: { 'animate-pulse': 1 },
    why: 'Status indicator: the dot for the rating the partner has not given yet.',
  },
  'src/app/components/landing/hard-truth-chat.tsx': {
    counts: { 'animate-pulse': 1 },
    why: 'Typing-cursor indicator in the scripted chat demo on the landing page.',
  },
  'src/app/pages/chat/MirrorReplyState.tsx': {
    counts: { 'animate-pulse': 1 },
    why: 'Typing indicator: "<name> is thinking…" while the mirror replies (P1554; moved out of MessageRow by P1576).',
  },
  'src/app/pages/chat/VoiceBubble.tsx': {
    counts: { 'loose-spinner': 2 },
    why: 'P1576: the play button spins in place while the audio loads (a control showing its own work), and "Transcribing…" labels its own small spinner.',
  },
  'src/app/pages/chat/VoiceControls.tsx': {
    counts: { 'animate-pulse': 1 },
    why: 'P1576: the red recording dot blinks while the mic records. A live-recording signal, not a wait.',
  },
  'src/app/pages/chat/chat-kit.tsx': {
    counts: { 'animate-pulse': 1 },
    why: 'Status indicator: the mirror portrait glyph pulses while the first portrait is being painted (P1554). The chat list and message skeletons in this file use <Skeleton>.',
  },
  'src/app/components/partners/rating-card.tsx': {
    counts: { 'animate-pulse': 1 },
    why: 'Waiting-for-partner text: "Waiting for <partner> to rate…" after the viewer has rated.',
  },
  'src/app/components/partners/demo-level-view.tsx': {
    counts: { 'animate-pulse': 4 },
    why: 'Waiting-for-partner text: four "Waiting for <partner> to …" lines in the paired exercise.',
  },
  'src/app/components/partners/position-buttons.tsx': {
    counts: { 'animate-pulse': 1 },
    why: 'Waiting-for-partner text: "Waiting for partner…" after the viewer picked a position.',
  },
  'src/app/pages/prototypes/new-live-prototype.tsx': {
    counts: { 'animate-pulse': 1 },
    why: 'Prototype of the live exercise: the same waiting-for-partner status line as free-mode-view.',
  },
  'src/app/components/session/reconnecting-countdown.tsx': {
    counts: { 'loose-spinner': 1 },
    why: 'Status indicator: "Waiting for <partner> to return…" with the reconnect countdown; the partner, not the page, is being waited on.',
  },
  'src/app/components/letters/letter-cover.tsx': {
    counts: { 'animate-pulse': 1 },
    why: 'Classified at :138: "Setting up your access…" hint under an already-drawn CTA when sign-in is slow (authDelayed). A status line on a drawn page, not a page or section wait.',
  },

  // --- Nav slot placeholder (P1421) ---
  'src/app/components/layout/simple-navigation.tsx': {
    counts: { 'animate-pulse': 1 },
    why: 'P1421: a ghost nav item that holds the slot while the nav list resolves, so the bar never jumps. Fixed-size placeholder inside the drawn shell, not a content wait.',
  },

  // --- Operation states: a control, a send, a save, an upload is working ---
  'src/app/components/pledge/sign-pledge-form.tsx': {
    counts: { 'animate-pulse': 1 },
    why: 'Classified at :350: pulsing icon inside the submit Button while "Signing…" (isSubmitting). Operation in a control.',
  },
  'src/app/components/social/witness-card.tsx': {
    counts: { 'animate-pulse': 1 },
    why: 'Classified at :161: pulsing icon inside the submit Button while "Accepting…" (isSubmitting). Operation in a control.',
  },
  'src/app/components/canvas/canvas-share-control.tsx': {
    counts: { 'loose-spinner': 3 },
    why: 'Three per-row save spinners (a share option, an access entry, the general-access select) beside the row control that is saving. Operation, one row at a time.',
  },
  'src/app/components/shared/banner/BannerControls.tsx': {
    counts: { 'loose-spinner': 1 },
    why: 'The "Generating banner" pill replaces the edit pencil while a banner is generated: a control showing its own work.',
  },
  'src/app/components/shared/image-upload-widget.tsx': {
    counts: { 'loose-spinner': 1 },
    why: 'Upload processing: spinner overlaid on the preview of the file being uploaded. Operation.',
  },
  'src/app/components/shared/profile-picker-input.tsx': {
    counts: { 'loose-spinner': 1 },
    why: 'Search/lookup progress inside the picker input (right edge of the field). Operation in an input.',
  },
  'src/app/components/social/point-supersede-banner.tsx': {
    counts: { 'loose-spinner': 1 },
    why: '14px inline spinner where the "Superseded by" link will be, inside a one-line banner. A small inline wait for a link target, not a section.',
  },
  'src/app/pages/chat/MirrorInfoDialog.tsx': {
    counts: { 'loose-spinner': 1 },
    why: 'Operation: a new portrait is being painted; spinner overlays the portrait in the dialog.',
  },
  'src/app/pages/my-sessions-page.tsx': {
    counts: { 'loose-spinner': 1, 'null-while-loading': 1 },
    why: 'Status of a record: a session row whose transcript is still being produced ("Transcribing your session…"). The list itself is drawn; the section skeletons in this file use <Skeleton>. Also: Not a wait: `if (!user) return null` follows `if (!sessionChecked || isLoading) return <ClarityPageLoader />`; the signed-out redirect runs in an effect.',
  },
  'src/app/pages/clarity-live-page.tsx': {
    counts: { 'loose-spinner': 1, 'animate-pulse': 1, 'null-while-loading': 1 },
    why: 'Operation labels kept by spec §2: "Joining session…" (:4155, auto-join after sign-in) and "Creating session…" (:4248). The page waits on auth with the page loader. Also: Not a wait: P703 defence in depth, a letter-sourced session shows nothing to a signed-in user who is neither its creator nor its listener (belt and braces for RLS).',
  },
  'src/app/pages/letter-compose-page.tsx': {
    counts: { 'animate-pulse': 1, 'null-while-loading': 1 },
    why: 'Classified at :354: the "Sealing your letter…" step, an in-flight seal RPC the writer triggered. A deliberate operation screen, not a data load. Borderline (page-level look): see the P1586 report. Also: Not a wait: the closing fall-through after the phase branches (compose, sealing, confirmation) have each returned.',
  },
  'src/app/pages/profile-page-v2.tsx': {
    counts: { 'animate-pulse': 1 },
    why: 'Classified at :985: shimmer over the banner while a new banner is generated (banner.isLoading). The profile is drawn; the banner image is the operation.',
  },
  'src/app/pages/artifacts/artifacts-page.tsx': {
    counts: { 'loading-text': 1, 'null-while-loading': 1 },
    why: 'Spec §2 operation: "Loading more…" under the list after "Show more" (:376). The first load uses the section skeleton. Also: Not a wait: `if (!user) return null` comes after `if (!sessionChecked || isLoading) return <ClarityPageLoader />`; the effect above has already sent the signed-out visitor to /login.',
  },
  'src/app/pages/chat/MessageList.tsx': {
    counts: { 'loading-text': 1 },
    why: 'Spec §2 operation: the load-earlier-messages button reads "Loading…" while it works.',
  },
  'src/app/pages/chat/NewMessageDialog.tsx': {
    counts: { 'loading-text': 1, 'animate-pulse': 1 },
    why: 'Spec §2 operation: search progress in the new-message dialog (a dialog read that already has its READ_DEADLINE): a pulsing bar and "Loading…".',
  },
  'src/app/pages/clarity-pledgers-page.tsx': {
    counts: { 'loading-text': 1 },
    why: 'Spec §2 operation: the "Show more" button reads "Loading…" while the next page loads (:126).',
  },
  // --- Category 4: a routed component that renders nothing. Each is a guard that is NOT a wait: auth or
  // param guards whose redirect runs in an effect, or a state the page cannot reach. A real wait draws
  // the page loader (`if (authLoading) return <ClarityPageLoader />` sits above every one of these). ---
  'src/app/pages/agreement-email-confirmation-page.tsx': {
    counts: { 'null-while-loading': 1 },
    why: 'Not a wait: no router state (email, agreementId, token) means the effect above redirects away; there is nothing to read.',
  },
  'src/app/pages/clarity-demo-page.tsx': {
    counts: { 'null-while-loading': 1 },
    why: 'Not a wait: the closing `// Fallback` `return null` of the demo page, after its view branches (start, room, review, done) have each returned.',
  },
  'src/app/pages/create-agreement-page.tsx': {
    counts: { 'null-while-loading': 1 },
    why: 'Not a wait: `if (!session) return null` follows `if (authLoading) return <ClarityPageLoader />`; the signed-out redirect runs in an effect.',
  },
  'src/app/pages/create-story-page.tsx': {
    counts: { 'null-while-loading': 1 },
    why: 'Not a wait: `if (!session) return null` follows `if (authLoading) return <ClarityPageLoader />`; the signed-out redirect runs in an effect.',
  },
  'src/app/pages/letter-overview-page.tsx': {
    counts: { 'null-while-loading': 1 },
    why: 'Not a wait: `if (!payload) return null` follows the loading, error and not-authorized branches, so it only narrows the type for the success render.',
  },
  'src/app/pages/letter-response-confirm-page.tsx': {
    counts: { 'null-while-loading': 1 },
    why: 'Not a wait: `pageState === "expired"` renders nothing because the effect above navigates to the signup recovery page; the waiting and confirming states use the page loader.',
  },
  'src/app/pages/me-page.tsx': {
    counts: { 'null-while-loading': 2 },
    why: 'Not a wait: two redirect frames, signed out (to login) and signed in with a slug (to the profile). Both follow the `authLoading` page-loader branch and navigate in an effect.',
  },
  'src/app/pages/pledge-confirmation-page.tsx': {
    counts: { 'null-while-loading': 1 },
    why: 'Not a wait: no email in the route state means the effect redirects; nothing is read from the server.',
  },
  'src/app/pages/settings-page.tsx': {
    counts: { 'null-while-loading': 1 },
    why: 'Not a wait: `if (!session) return null` follows `if (authLoading) return <ClarityPageLoader />`; the signed-out redirect runs in an effect.',
  },
  'src/app/pages/topics-page.tsx': {
    counts: { 'null-while-loading': 1 },
    why: 'Spec §1 state 4, an optional section that renders nothing: the embedded topics list is absent until it has topics, and tells its host page so (onVisibleChange). Standalone, the page draws its own skeleton.',
  },
  'src/app/pages/transcribe-room-page.tsx': {
    counts: { 'null-while-loading': 1 },
    why: 'Not a wait: `if (!user) return null` follows the page-loader branch (`!sessionChecked || authLoading || view === "loading"`); the signed-out redirect runs in an effect.',
  },

  // --- Category 6: the page loader inside a frame that is already drawn. Only a Back-only header, a bare
  // wrapper, or a layout shell that paints nothing may sit around it (decisions.md 2026-04-11). ---
  'src/app/pages/calibration-breakdown-page.tsx': {
    counts: { 'page-loader-in-frame': 1 },
    why: 'P1364 UX Notes: while loading, the top Back (FocusHeader) is the only thing drawn; the page loader sits under it. No section or content frame is on screen.',
  },
  'src/app/pages/explain-back-view-page.tsx': {
    counts: { 'page-loader-in-frame': 1 },
    why: 'P1364 UX Notes: loading draws the top Back only (FocusHeader) inside a bare padded column; the page loader sits under it.',
  },
  'src/app/pages/letter-results-page.tsx': {
    counts: { 'page-loader-in-frame': 1 },
    why: 'P1364 UX Notes: loading draws the top Back only (FocusHeader) inside a bare <main>; the page loader sits under it.',
  },
  'src/app/pages/video-summary-page.tsx': {
    counts: { 'page-loader-in-frame': 1 },
    why: 'P1364 UX Notes + P1586: loading draws the top Back only, absolutely positioned over the page loader so the mark does not move down by Back\'s height. No other frame is drawn.',
  },
  'src/app/pages/letter-reading-page.tsx': {
    counts: { 'page-loader-in-frame': 3 },
    why: 'The three loaders (cover while skipToComplete, complete while the delivery id resolves) sit inside CertificatePageShell, which is a bare centred column with no background or border (certificate-page-shell.tsx), beside viewState branches that are mutually exclusive. Nothing else is drawn while they show.',
  },
  'src/auth/AuthCallbackPage.tsx': {
    counts: { 'page-loader-in-frame': 1 },
    why: 'Bare `<div data-status>` wrapper that exists only to keep `status` in the render tree (its own comment); it paints nothing, the page loader is the whole page.',
  },
};

// ---------------------------------------------------------------------------------------------
// Detectors
// ---------------------------------------------------------------------------------------------

/** Tags that make a spinner an operation indicator rather than a section/page wait. */
function isControlTag(tag: string): boolean {
  return (
    /^(?:button|a|input|textarea|select|summary|Link|NavLink|Input|Textarea|SelectTrigger)$/.test(tag) ||
    /Button$/.test(tag)
  );
}

function openingOf(node: ts.Node): ts.JsxOpeningLikeElement | undefined {
  if (ts.isJsxElement(node)) return node.openingElement;
  if (ts.isJsxSelfClosingElement(node)) return node;
  return undefined;
}

function hasControlRole(opening: ts.JsxOpeningLikeElement, sf: ts.SourceFile): boolean {
  return opening.attributes.properties.some(
    p => ts.isJsxAttribute(p) && p.name.getText(sf) === 'role' && /["'](?:button|menuitem)["']/.test(p.getText(sf))
  );
}

/** Walks parents: is `node` inside (or itself) a control element? */
function insideControl(node: ts.Node, sf: ts.SourceFile): boolean {
  for (let n: ts.Node | undefined = node; n; n = n.parent) {
    const opening = openingOf(n);
    if (opening && (isControlTag(opening.tagName.getText(sf)) || hasControlRole(opening, sf))) return true;
  }
  return false;
}

/** The JSX element a token sits on: its own element, or the nearest enclosing one. */
function nearestElement(node: ts.Node): ts.JsxOpeningLikeElement | ts.JsxElement | undefined {
  for (let n: ts.Node | undefined = node; n; n = n.parent) {
    if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) return ts.isJsxOpeningElement(n) ? n.parent : n;
  }
  return undefined;
}

/** True if `node` is inside an element that is `sr-only` (assistive-tech-only text is not a loading look). */
function insideSrOnly(node: ts.Node, sf: ts.SourceFile): boolean {
  for (let n: ts.Node | undefined = node; n; n = n.parent) {
    const opening = openingOf(n);
    if (opening && opening.attributes.properties.some(p => ts.isJsxAttribute(p) && /\bsr-only\b/.test(p.getText(sf)))) return true;
  }
  return false;
}

function insideJsxAttribute(node: ts.Node): boolean {
  for (let n: ts.Node | undefined = node; n; n = n.parent) {
    if (ts.isJsxAttribute(n)) return true;
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)) return false;
  }
  return false;
}

function insideJsx(node: ts.Node): boolean {
  for (let n: ts.Node | undefined = node; n; n = n.parent) {
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)) return true;
  }
  return false;
}

const unparen = (e: ts.Expression): ts.Expression => (ts.isParenthesizedExpression(e) ? unparen(e.expression) : e);

/** `null`, or a ternary with a null arm, under any number of parentheses. */
function isBlankRender(expression: ts.Expression): boolean {
  const e = unparen(expression);
  if (e.kind === ts.SyntaxKind.NullKeyword) return true;
  return (
    ts.isConditionalExpression(e) &&
    (unparen(e.whenTrue).kind === ts.SyntaxKind.NullKeyword || unparen(e.whenFalse).kind === ts.SyntaxKind.NullKeyword)
  );
}

/**
 * Name of the component whose render `node` belongs to: the NEAREST enclosing function must itself
 * be the component (`function X`, `const X = () =>`, `const X = memo(() => ...)`, or a class's
 * `render`). A null returned from a callback inside it (`.map`, an event handler) is not a render.
 */
function enclosingComponentName(node: ts.Node): string | undefined {
  let fn: ts.Node | undefined = node.parent;
  while (fn && !ts.isFunctionLike(fn)) fn = fn.parent;
  if (!fn) return undefined;
  const pascal = (t: string) => /^[A-Z]/.test(t);
  if (ts.isFunctionDeclaration(fn)) return fn.name && pascal(fn.name.text) ? fn.name.text : undefined;
  if (ts.isMethodDeclaration(fn) && fn.name.getText() === 'render' && ts.isClassLike(fn.parent)) {
    return fn.parent.name?.text;
  }
  if (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) {
    let holder: ts.Node = fn.parent;
    // memo(...) / forwardRef(...) wrap the component
    if (ts.isCallExpression(holder)) holder = holder.parent;
    if (ts.isVariableDeclaration(holder) && ts.isIdentifier(holder.name) && pascal(holder.name.text)) {
      return holder.name.text;
    }
  }
  return undefined;
}

/**
 * "Loading" as a look: the capitalised word anywhere, or a lowercase one that opens the text
 * ("loading events…"). A lowercase word mid-sentence is prose ("Something went wrong loading your
 * drafts") and a bare lowercase string is a status value (`state.kind === 'loading'`).
 */
function isLoadingWord(text: string, mayBeStatusValue: boolean): boolean {
  return /\bLoading\b/.test(text) || (/^\s*loading\b/i.test(text) && !(mayBeStatusValue && text.trim() === 'loading'));
}
const SPIN_CLASS = /animate-spin(?![-\w])|animate-\[spin/;
const PULSE_CLASS = /animate-pulse(?![-\w])|animate-\[pulse/;

const LOADER_NAMES = ['ClarityLoader'];
const PAGE_LOADER_NAMES = ['ClarityPageLoader', 'ClarityContentLoader', 'ClarityBootLoader'];
const SPINNER_NAMES = ['Loader2', 'Loader2Icon'];

/** Text a class string can live in: string literals, template parts. */
function isClassText(node: ts.Node): node is ts.StringLiteralLike | ts.TemplateHead | ts.TemplateMiddle | ts.TemplateTail {
  return ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node);
}

/** Local names the file gives the loader, page loader and spinner icons (an `as` alias adds a name). */
function importedNames(sf: ts.SourceFile): { loader: Set<string>; pageLoader: Set<string>; spinner: Set<string> } {
  const out = { loader: new Set(LOADER_NAMES), pageLoader: new Set(PAGE_LOADER_NAMES), spinner: new Set(SPINNER_NAMES) };
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !st.importClause?.namedBindings || !ts.isNamedImports(st.importClause.namedBindings)) continue;
    for (const el of st.importClause.namedBindings.elements) {
      const original = (el.propertyName ?? el.name).text;
      if (LOADER_NAMES.includes(original)) out.loader.add(el.name.text);
      if (PAGE_LOADER_NAMES.includes(original)) out.pageLoader.add(el.name.text);
      if (SPINNER_NAMES.includes(original)) out.spinner.add(el.name.text);
    }
  }
  return out;
}

/** The children of a fragment that put something on screen, other than the branch holding the loader. */
function drawnSibling(fragment: ts.JsxFragment, holder: ts.Node, sf: ts.SourceFile, loaders: ReadonlySet<string>): boolean {
  const paintsNothing = (tag: string) => tag === 'Navigate' || loaders.has(tag);
  // Every JSX element under `n` is a redirect, a page loader or screen-reader-only text (and there is at least one).
  const onlyInert = (n: ts.Node): boolean => {
    let seen = false;
    let inert = true;
    const walk = (c: ts.Node) => {
      if (ts.isJsxElement(c) || ts.isJsxSelfClosingElement(c) || ts.isJsxFragment(c)) {
        if (ts.isJsxFragment(c)) { ts.forEachChild(c, walk); return; }
        seen = true;
        const open = ts.isJsxElement(c) ? c.openingElement : c;
        if (!paintsNothing(open.tagName.getText(sf)) && !insideSrOnly(open, sf)) inert = false;
        return;
      }
      ts.forEachChild(c, walk);
    };
    walk(n);
    return seen && inert;
  };
  return fragment.children.some((child) => {
    if (child === holder) return false;
    if (ts.isJsxText(child)) return child.text.trim().length > 0;
    if (ts.isJsxExpression(child)) return child.expression !== undefined && !onlyInert(child);
    return !onlyInert(child);
  });
}

/**
 * Is this page loader nested inside a frame that is already on screen? Walking up from its own element,
 * the only things allowed between it and the component's render are parentheses, a ternary / `&&` / `||`
 * arm, a fragment with no drawn sibling, and the `fallback` of a Suspense (which paints nothing, so the
 * walk continues from the Suspense). A JsxElement ancestor, an attribute value such as `fallback={...}`
 * on anything else, or a fragment with a drawn sibling, means something else is drawn around it.
 */
function isNestedInFrame(node: ts.Node, sf: ts.SourceFile, loaders: ReadonlySet<string>): boolean {
  // An opening element's parent is its own JsxElement: that is the loader, not a frame around it.
  let prev: ts.Node = ts.isJsxOpeningElement(node) ? node.parent : node;
  for (let n: ts.Node | undefined = prev.parent; n; prev = n, n = n.parent) {
    if (ts.isFunctionLike(n) || ts.isReturnStatement(n) || ts.isSourceFile(n)) return false;
    if (ts.isJsxAttribute(n)) {
      const owner = n.parent.parent; // JsxAttributes -> opening / self-closing element
      const tag = owner.tagName.getText(sf);
      if (n.name.getText(sf) !== 'fallback' || (tag !== 'Suspense' && tag !== 'React.Suspense')) return true;
      // Continue from the Suspense element itself.
      prev = ts.isJsxOpeningElement(owner) ? owner.parent : owner;
      n = prev;
      continue;
    }
    if (ts.isJsxFragment(n)) {
      if (drawnSibling(n, prev, sf, loaders)) return true;
      continue;
    }
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) return true;
  }
  return false;
}

export interface DetectOptions {
  /**
   * Names of the components a route renders directly, from this file. `undefined` = the file is
   * not routed (category 4 is skipped); `'*'` = routed through a default export we could not
   * name, so every PascalCase function in the file counts.
   */
  routedNames?: ReadonlySet<string> | '*';
}

/** Runs all six detectors over one source text. File-level standard exemptions are applied by the caller. */
export function findLoadingDrift(fileName: string, source: string, opts: DetectOptions = {}): Finding[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const findings: Finding[] = [];
  const at = (node: ts.Node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  const add = (kind: Kind, node: ts.Node, text?: string) =>
    findings.push({ kind, line: at(node), text: (text ?? node.getText(sf)).replace(/\s+/g, ' ').slice(0, 120) });
  const spinnerAnchors = new Set<number>();

  // `import { ClarityLoader as X }` renames the tag; every local name counts.
  const names = importedNames(sf);

  const visit = (node: ts.Node) => {
    // 1. large ClarityLoader
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (names.loader.has(node.tagName.getText(sf))) {
        const size = node.attributes.properties.find(
          (p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText(sf) === 'size'
        );
        const init = size?.initializer;
        const literal =
          init && ts.isStringLiteral(init)
            ? init.text
            : init && ts.isJsxExpression(init) && init.expression && ts.isStringLiteralLike(init.expression)
              ? init.expression.text
              : undefined;
        if (literal !== 'sm') add('large-clarity-loader', node);
      }
    }

    // 2. "Loading" as visible text (any case): JSX text, or a string / template literal rendered through
    // a JSX expression (a template with a substitution is matched by its head, middle and tail parts).
    if (ts.isJsxText(node) && isLoadingWord(node.text, false) && !insideSrOnly(node, sf)) {
      add('loading-text', node, node.text.trim());
    }
    if (
      (ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node) ||
        ts.isTemplateHead(node) ||
        ts.isTemplateMiddle(node) ||
        ts.isTemplateTail(node)) &&
      isLoadingWord(node.text, ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      insideJsx(node) &&
      !insideJsxAttribute(node) &&
      !insideSrOnly(node, sf)
    ) {
      add('loading-text', node);
    }

    // 3. loose spinner: Loader2 / Loader2Icon references (under any import alias) and animate-spin strings
    if (
      ts.isIdentifier(node) &&
      names.spinner.has(node.text) &&
      !ts.isImportSpecifier(node.parent) &&
      !ts.isImportClause(node.parent) &&
      !ts.isExportSpecifier(node.parent)
    ) {
      const el = nearestElement(node);
      const key = el ? el.getStart(sf) : node.getStart(sf);
      if (!spinnerAnchors.has(key) && !(el && insideControl(el, sf))) {
        spinnerAnchors.add(key);
        add('loose-spinner', el ?? node);
      }
    }
    if (isClassText(node) && SPIN_CLASS.test(node.text)) {
      const el = nearestElement(node);
      const key = el ? el.getStart(sf) : node.getStart(sf);
      if (!spinnerAnchors.has(key) && !(el && insideControl(el, sf))) {
        spinnerAnchors.add(key);
        add('loose-spinner', el ?? node);
      }
    }

    // 4. a routed component renders nothing: `return null` (under any guard, or none) or a ternary with a
    // null arm. A route that has nothing to paint must say why in the allowlist; a wait must not be blank.
    // Parentheses are unwrapped; a concise arrow body is a return too.
    const rendered =
      ts.isReturnStatement(node) ? node.expression : ts.isArrowFunction(node) && !ts.isBlock(node.body) ? node.body : undefined;
    if (opts.routedNames && rendered) {
      if (isBlankRender(rendered)) {
        const name = enclosingComponentName(rendered);
        if (opts.routedNames === '*' ? name !== undefined : name !== undefined && opts.routedNames.has(name)) {
          add('null-while-loading', rendered.parent);
        }
      }
    }

    // 5. animate-pulse outside the primitive (the arbitrary-value form `animate-[pulse_…]` included)
    if ((isClassText(node) || ts.isJsxText(node)) && PULSE_CLASS.test(node.text)) {
      add('animate-pulse', node, node.text.trim());
    }

    // 6. the page loader drawn inside a frame that is already on screen
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      if (names.pageLoader.has(node.tagName.getText(sf)) && isNestedInFrame(node, sf, names.pageLoader)) add('page-loader-in-frame', node);
    }

    ts.forEachChild(node, visit);
  };
  visit(sf);
  return findings;
}

// ---------------------------------------------------------------------------------------------
// Deriving members from the tree
// ---------------------------------------------------------------------------------------------

/** Route arrays live here: lazy pages that a route table in App.tsx maps to paths. */
const ROUTE_ARRAY_DIR = 'src/app/routes/';

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === '__tests__' || name === 'tests') continue;
      out.push(...listSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/** `@/x` and relative specifiers to a repo-relative source file; undefined for packages and misses. */
function resolveModule(root: string, fromFile: string, spec: string): string | undefined {
  const base = spec.startsWith('@/')
    ? join('src', spec.slice(2))
    : spec.startsWith('.')
      ? join(dirname(fromFile), spec)
      : undefined;
  if (!base) return undefined;
  for (const cand of [`${base}.tsx`, `${base}.ts`, join(base, 'index.tsx'), join(base, 'index.ts')]) {
    if (existsSync(join(root, cand))) return cand.split(sep).join('/');
  }
  return undefined;
}

type RoutedMap = Map<string, Set<string> | '*'>;

function addRouted(routed: RoutedMap, file: string, exportName: string): void {
  if (exportName === 'default') {
    routed.set(file, '*');
    return;
  }
  const cur = routed.get(file);
  if (cur === '*') return;
  const names = cur ?? new Set<string>();
  names.add(exportName);
  routed.set(file, names);
}

interface Binding {
  file: string;
  exportName: string;
}

/** Static imports and `lazy(() => import('…').then(m => ({ default: m.Name })))` consts of one file. */
function moduleBindings(root: string, file: string, sf: ts.SourceFile): Map<string, Binding> {
  const bindings = new Map<string, Binding>();
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier) && st.importClause) {
      const target = resolveModule(root, file, st.moduleSpecifier.text);
      if (!target) continue;
      const clause = st.importClause;
      if (clause.name) bindings.set(clause.name.text, { file: target, exportName: 'default' });
      if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const el of clause.namedBindings.elements) {
          bindings.set(el.name.text, { file: target, exportName: (el.propertyName ?? el.name).text });
        }
      }
    }
  }
  const lazyOf = (init: ts.Expression): Binding | undefined => {
    if (!ts.isCallExpression(init) || init.expression.getText(sf) !== 'lazy') return undefined;
    const text = init.getText(sf);
    const spec = /import\(\s*["']([^"']+)["']\s*\)/.exec(text)?.[1];
    const target = spec ? resolveModule(root, file, spec) : undefined;
    if (!target) return undefined;
    return { file: target, exportName: /default:\s*m\.(\w+)/.exec(text)?.[1] ?? 'default' };
  };
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const b = lazyOf(node.initializer);
      if (b) bindings.set(node.name.text, b);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return bindings;
}

/** Every lazy() page a file declares, bound to a name or not (a route array keeps them in object literals). */
function lazyPages(root: string, file: string, sf: ts.SourceFile): Binding[] {
  const out: Binding[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.expression.getText(sf) === 'lazy') {
      const text = node.getText(sf);
      const spec = /import\(\s*["']([^"']+)["']\s*\)/.exec(text)?.[1];
      const target = spec ? resolveModule(root, file, spec) : undefined;
      if (target) out.push({ file: target, exportName: /default:\s*m\.(\w+)/.exec(text)?.[1] ?? 'default' });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** Does this file render a `<Route element=…>`? Cheap text screen first, then the AST. */
export function rendersRoutes(source: string): boolean {
  if (!/<Route\b/.test(source) || !/\belement=/.test(source)) return false;
  const sf = ts.createSourceFile('x.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found = false;
  const visit = (node: ts.Node) => {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.tagName.getText(sf) === 'Route' &&
      node.attributes.properties.some(p => ts.isJsxAttribute(p) && p.name.getText(sf) === 'element')
    ) {
      found = true;
    }
    if (!found) ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

/**
 * Two derivation paths, merged by the caller:
 *   - a file that renders `<Route element={…}>` (App.tsx, and any nested `<Routes>` such as
 *     prototypes/events/index.tsx): every component named in an `element` is routed. Resolved through
 *     the file's imports (`@/…` and relative) and lazy() consts; a component declared in the same file
 *     is routed there.
 *   - a route array (src/app/routes/*): its lazy() pages exist only to be mounted by a route, so each
 *     one is routed.
 */
export function deriveRoutedFromFile(root: string, file: string, source: string): RoutedMap {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const bindings = moduleBindings(root, file, sf);
  const routed: RoutedMap = new Map();

  if (file.startsWith(ROUTE_ARRAY_DIR)) {
    for (const b of lazyPages(root, file, sf)) addRouted(routed, b.file, b.exportName);
  }

  const localComponents = new Set<string>();
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name && /^[A-Z]/.test(st.name.text)) localComponents.add(st.name.text);
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && /^[A-Z]/.test(d.name.text) && !bindings.has(d.name.text)) localComponents.add(d.name.text);
      }
    }
  }

  const tags = new Set<string>();
  const collect = (n: ts.Node) => {
    if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
      const tag = n.tagName.getText(sf);
      if (/^[A-Z]/.test(tag)) tags.add(tag);
    }
    ts.forEachChild(n, collect);
  };
  const visit = (node: ts.Node) => {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.tagName.getText(sf) === 'Route'
    ) {
      const element = node.attributes.properties.find(
        (p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText(sf) === 'element'
      );
      if (element) collect(element);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  for (const tag of tags) {
    const b = bindings.get(tag);
    if (b) addRouted(routed, b.file, b.exportName);
    else if (localComponents.has(tag)) addRouted(routed, file, tag);
  }
  return routed;
}

/** Merges the routed components of every route-rendering file and route array under src/. */
export function deriveRouted(root: string, files: string[], read: (f: string) => string): RoutedMap {
  const routed: RoutedMap = new Map();
  for (const file of files) {
    const source = read(file);
    if (!file.startsWith(ROUTE_ARRAY_DIR) && !rendersRoutes(source)) continue;
    for (const [target, names] of deriveRoutedFromFile(root, file, source)) {
      if (names === '*') addRouted(routed, target, 'default');
      else for (const n of names) addRouted(routed, target, n);
    }
  }
  return routed;
}

// ---------------------------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------------------------

describe('P1586 loading-states guard — the detectors themselves (controls)', () => {
  const kinds = (src: string, opts?: DetectOptions) => findLoadingDrift('x.tsx', src, opts).map(f => f.kind);
  const ROUTED: DetectOptions = { routedNames: new Set(['Page']) };

  it('1 flags a ClarityLoader that is lg, md or unsized, and passes sm (bad / good)', () => {
    expect(kinds(`const A = () => <ClarityLoader size="lg" />;`)).toEqual(['large-clarity-loader']);
    expect(kinds(`const A = () => <ClarityLoader size="md" />;`)).toEqual(['large-clarity-loader']);
    expect(kinds(`const A = () => <ClarityLoader size={'lg'} />;`)).toEqual(['large-clarity-loader']);
    expect(kinds(`const A = () => <ClarityLoader />;`)).toEqual(['large-clarity-loader']);
    expect(kinds(`const A = () => <ClarityLoader size={big ? 'lg' : 'sm'} />;`)).toEqual(['large-clarity-loader']);
    expect(kinds(`const A = () => <ClarityLoader size="sm" />;`)).toEqual([]);
    expect(kinds(`const A = () => <ClarityPageLoader />;`)).toEqual([]);
  });

  it('1 an aliased import of ClarityLoader is still the mark (bad), a sm alias passes (good)', () => {
    const imp = `import { ClarityLoader as Mark } from '@/components/ui/clarity-loader';\n`;
    expect(kinds(`${imp}const A = () => <div className="min-h-screen flex items-center justify-center"><Mark size="lg" /></div>;`)).toEqual([
      'large-clarity-loader',
    ]);
    expect(kinds(`${imp}const A = () => <Mark />;`)).toEqual(['large-clarity-loader']);
    expect(kinds(`${imp}const A = () => <Mark size="sm" />;`)).toEqual([]);
    // an unrelated component that happens to be called Mark in another file is not the loader
    expect(kinds(`import { Mark } from 'x';\nconst A = () => <Mark size="lg" />;`)).toEqual([]);
  });

  it('2 flags visible "Loading" text and a rendered "Loading…" string, passes aria, sr-only, labels and comments', () => {
    expect(kinds(`const A = () => <p>Loading events…</p>;`)).toEqual(['loading-text']);
    expect(kinds(`const A = () => <p>Loading...</p>;`)).toEqual(['loading-text']);
    expect(kinds(`const A = () => <button>{busy ? 'Loading…' : 'Show more'}</button>;`)).toEqual(['loading-text']);
    expect(kinds(`const A = () => <div aria-label="Loading events" />;`)).toEqual([]);
    expect(kinds(`const A = () => <div role="status" aria-label={'Loading x'} />;`)).toEqual([]);
    expect(kinds(`const A = () => <span className="sr-only">Loading {kind}</span>;`)).toEqual([]);
    expect(kinds(`const OVERLAY = { label: 'Loading the booking calendar' };`)).toEqual([]);
    expect(kinds(`export const CHUNK = ['Loading chunk', 'Loading CSS chunk'];`)).toEqual([]);
    expect(kinds(`// Loading… in a comment\nconst A = () => <>{/* Loading… */}</>;`)).toEqual([]);
    expect(kinds(`const A = () => <p>Downloading</p>;`)).toEqual([]);
  });

  it('2 lowercase "loading…" and a template literal with a substitution are the same text look (bypasses closed)', () => {
    // lowercase, opening the text
    expect(kinds(`const A = () => <p>loading events…</p>;`)).toEqual(['loading-text']);
    expect(kinds(`const A = () => <p>{busy ? 'loading…' : 'more'}</p>;`)).toEqual(['loading-text']);
    // a template literal with a substitution: the head, middle or tail carries the word
    expect(kinds('const A = () => <p>{`Loading ${kind}…`}</p>;')).toEqual(['loading-text']);
    expect(kinds('const A = () => <p>{`Please wait: ${kind} Loading…`}</p>;')).toEqual(['loading-text']);
    expect(kinds('const A = () => <p>{`loading ${kind}`}</p>;')).toEqual(['loading-text']);
    // good: prose that merely contains the lowercase word, status values, attributes
    expect(kinds(`const A = () => <p>Something went wrong loading your drafts.</p>;`)).toEqual([]);
    expect(kinds(`const A = () => <p>{state.kind === 'loading' && <Foo />}</p>;`)).toEqual([]);
    expect(kinds('const A = () => <div aria-label={`Loading ${kind}`} />;')).toEqual([]);
    expect(kinds('const A = () => <span className="sr-only">{`Loading ${kind}`}</span>;')).toEqual([]);
    expect(kinds('const msg = `Loading ${kind}…`;')).toEqual([]);
    // DOCUMENTED LIMITATION: `const MSG = 'Loading…'` rendered later as {MSG} needs data-flow analysis. The
    // string is outside JSX where it is declared, so it is not seen (see the header of this file).
    expect(kinds(`const MSG = 'Loading…'; const A = () => <p>{MSG}</p>;`)).toEqual([]);
  });

  it('3 flags a loose Loader2 / Loader2Icon / animate-spin, passes one inside a control', () => {
    expect(kinds(`const A = () => <div><Loader2 className="h-6 w-6" /></div>;`)).toEqual(['loose-spinner']);
    expect(kinds(`const A = () => <Loader2Icon />;`)).toEqual(['loose-spinner']);
    expect(kinds(`const A = () => <div className="animate-spin h-5 w-5 border-2" />;`)).toEqual(['loose-spinner']);
    expect(kinds(`const A = () => <div className={cn('x', busy && \`animate-spin\`)} />;`)).toEqual(['loose-spinner']);
    expect(kinds(`const SPIN = 'animate-spin';`)).toEqual(['loose-spinner']);
    // one element, both a Loader2 and animate-spin: counted once
    expect(kinds(`const A = () => <Loader2 className="animate-spin" />;`)).toEqual(['loose-spinner']);
    expect(kinds(`const A = () => <button disabled>{busy && <Loader2 className="animate-spin" />}Save</button>;`)).toEqual([]);
    expect(kinds(`const A = () => <Button><Loader2 className="animate-spin" /></Button>;`)).toEqual([]);
    expect(kinds(`const A = () => <Button icon={Loader2}>Save</Button>;`)).toEqual([]);
    expect(kinds(`const A = () => <CopyButton><Loader2Icon /></CopyButton>;`)).toEqual([]);
    expect(kinds(`const A = () => <Link to="/x"><Loader2 /></Link>;`)).toEqual([]);
    expect(kinds(`const A = () => <a href="/x"><span className="animate-spin" /></a>;`)).toEqual([]);
    expect(kinds(`const A = () => <div role="button"><Loader2 /></div>;`)).toEqual([]);
    expect(kinds(`import { Loader2 } from 'lucide-react';\nexport { Loader2 } from 'lucide-react';`)).toEqual([]);
    expect(kinds(`const A = () => <div className="hover:animate-spinner-x" />;`)).toEqual([]);
  });

  it('3 an aliased Loader2 and the arbitrary-value animate-[spin…] are loose spinners too (bypasses closed)', () => {
    expect(kinds(`import { Loader2 as Spinner } from 'lucide-react';\nconst A = () => <div><Spinner /></div>;`)).toEqual(['loose-spinner']);
    expect(kinds(`import { Loader2 as Spinner } from 'lucide-react';\nconst A = () => <button><Spinner /></button>;`)).toEqual([]);
    expect(kinds(`const A = () => <div className="animate-[spin_1s_linear_infinite] h-5 w-5" />;`)).toEqual(['loose-spinner']);
    expect(kinds(`const A = () => <button><span className="animate-[spin_1s_linear_infinite]" /></button>;`)).toEqual([]);
  });

  it('4 flags a routed component that renders nothing, under any guard, and only a routed one', () => {
    // loading flags of every shape
    expect(kinds(`function Page() { if (loading) return null; return <div/>; }`, ROUTED)).toEqual(['null-while-loading']);
    expect(kinds(`const Page = () => { if (authLoading || !user) { return null; } return <div/>; };`, ROUTED)).toEqual(['null-while-loading']);
    expect(kinds(`function Page() { if (!loaded) return null; return <div/>; }`, ROUTED)).toEqual(['null-while-loading']);
    expect(kinds(`function Page() { if (fetchState === 'loading') return null; return <div/>; }`, ROUTED)).toEqual(['null-while-loading']);
    expect(kinds(`function Page() { return isLoading ? null : <div/>; }`, ROUTED)).toEqual(['null-while-loading']);
    // the shapes the first version missed: `=== null` gates, `!ready`, `!event`, a redirect then null
    expect(kinds(`function Page() { if (arrivalGate === null) return null; return <div/>; }`, ROUTED)).toEqual(['null-while-loading']);
    expect(kinds(`function Page() { if (!ready) return null; return <div/>; }`, ROUTED)).toEqual(['null-while-loading']);
    expect(kinds(`function Page() { if (!baseReady) return null; return <div/>; }`, ROUTED)).toEqual(['null-while-loading']);
    expect(kinds(`function Page() { if (!rowsReady) return null; return <div/>; }`, ROUTED)).toEqual(['null-while-loading']);
    expect(kinds(`function Page() { if (!event) return null; return <div/>; }`, ROUTED)).toEqual(['null-while-loading']);
    expect(kinds(`function Page() { if (frozen) { navigate('/x', { replace: true }); return null; } return <div/>; }`, ROUTED)).toEqual([
      'null-while-loading',
    ]);
    // a genuine "nothing to show" is still a finding: it needs a reason in the allowlist
    expect(kinds(`function Page() { if (!user) return null; return <div/>; }`, ROUTED)).toEqual(['null-while-loading']);
    // good: a page loader or a skeleton is a render, a redirect element is a render
    expect(kinds(`function Page() { if (loading) return <ClarityPageLoader />; return <div/>; }`, ROUTED)).toEqual([]);
    expect(kinds(`function Page() { if (arrivalGate === null) return <ClarityPageLoader />; return <div/>; }`, ROUTED)).toEqual([]);
    expect(kinds(`function Page() { if (!user) return <Navigate to="/login" replace />; return <div/>; }`, ROUTED)).toEqual([]);
    // a helper component in the same file, not the routed export
    expect(kinds(`function Helper() { if (loading) return null; return <div/>; }`, ROUTED)).toEqual([]);
    // not routed at all
    expect(kinds(`function Page() { if (loading) return null; return <div/>; }`)).toEqual([]);
    // default-export routed: any component in the file counts
    expect(kinds(`function Inner() { if (loading) return null; return <div/>; }`, { routedNames: '*' })).toEqual(['null-while-loading']);
    // a null return inside a nested callback is not the component's render
    expect(kinds(`function Page() { const f = () => { if (loading) return null; }; return <div/>; }`, ROUTED)).toEqual([]);
    expect(kinds(`function Page() { const v = useMemo(() => { if (x) return null; return 1; }, []); return <div/>; }`, ROUTED)).toEqual([]);
  });

  it('4 parentheses are unwrapped and a concise arrow body counts (bypasses closed)', () => {
    // bad: a parenthesised null, a parenthesised ternary null arm, concise arrow bodies that render nothing
    expect(kinds(`function Page() { if (loading) return (null); return <div/>; }`, ROUTED)).toEqual(['null-while-loading']);
    expect(kinds(`function Page() { if (loading) return ((null)); return <div/>; }`, ROUTED)).toEqual(['null-while-loading']);
    expect(kinds(`function Page() { return (loading ? (null) : <div/>); }`, ROUTED)).toEqual(['null-while-loading']);
    expect(kinds(`function Page() { return loading ? <div/> : (null); }`, ROUTED)).toEqual(['null-while-loading']);
    expect(kinds(`const Page = () => null;`, ROUTED)).toEqual(['null-while-loading']);
    expect(kinds(`const Page = () => (null);`, ROUTED)).toEqual(['null-while-loading']);
    expect(kinds(`const Page = () => (loading ? null : <div/>);`, ROUTED)).toEqual(['null-while-loading']);
    expect(kinds(`const Page = memo(() => null);`, ROUTED)).toEqual(['null-while-loading']);
    // good: parenthesised JSX, concise arrow bodies that draw, a loader, a callback's null, a helper that is not routed
    expect(kinds(`function Page() { if (loading) return (<ClarityPageLoader />); return (<div/>); }`, ROUTED)).toEqual([]);
    expect(kinds(`const Page = () => (loading ? <ClarityPageLoader /> : <div/>);`, ROUTED)).toEqual([]);
    expect(kinds(`const Page = () => <div/>;`, ROUTED)).toEqual([]);
    expect(kinds(`function Page() { const v = useMemo(() => null, []); return <div/>; }`, ROUTED)).toEqual([]);
    expect(kinds(`function Page() { return <div>{items.map((i) => null)}</div>; }`, ROUTED)).toEqual([]);
    expect(kinds(`const Helper = () => null;`, ROUTED)).toEqual([]);
    expect(kinds(`const Page = () => null;`)).toEqual([]);
  });

  it('4 on the real file: the loader of EventArrivingPage turned into `return (null)` fails the scan', () => {
    const f = 'src/app/prototypes/events/arrival/EventArrivingPage.tsx';
    const opts: DetectOptions = { routedNames: new Set(['EventArrivingPage']) };
    const real = readFileSync(join(process.cwd(), f), 'utf8');
    expect(real).toContain('if (loading) return <ClarityPageLoader />;');
    expect(findLoadingDrift(f, real, opts).map(x => x.kind)).not.toContain('null-while-loading');
    const mutated = real.replace('if (loading) return <ClarityPageLoader />;', 'if (loading) return (null);');
    expect(mutated).not.toBe(real);
    expect(findLoadingDrift(f, mutated, opts).map(x => x.kind)).toEqual(['null-while-loading']);
  });

  it('5 flags animate-pulse, passes animate-pulse-subtle-green and look-alikes', () => {
    expect(kinds(`const A = () => <div className="h-4 animate-pulse bg-muted" />;`)).toEqual(['animate-pulse']);
    expect(kinds(`const A = () => <div className={cn('a', \`animate-pulse \${x}\`)} />;`)).toEqual(['animate-pulse']);
    expect(kinds(`const S = 'animate-pulse';`)).toEqual(['animate-pulse']);
    expect(kinds(`const A = () => <div className="animate-pulse-subtle-green" />;`)).toEqual([]);
    expect(kinds(`const A = () => <div className="animate-pulse_x motion-safe:animate-pulses" />;`)).toEqual([]);
    expect(kinds(`// animate-pulse in a comment\nconst A = () => <div />;`)).toEqual([]);
    expect(kinds(`const A = () => <Skeleton className="h-4" />;`)).toEqual([]);
  });

  it('5 the arbitrary-value form animate-[pulse…] is a pulse too (bypass closed)', () => {
    expect(kinds(`const A = () => <div className="h-4 animate-[pulse_2s_infinite] bg-muted" />;`)).toEqual(['animate-pulse']);
    expect(kinds(`const A = () => <div className={cn('a', 'motion-safe:animate-[pulse_1s_ease]')} />;`)).toEqual(['animate-pulse']);
    expect(kinds(`const A = () => <div className="animate-[wiggle_1s]" />;`)).toEqual([]);
  });

  it('6 the page loader may only be the whole render: bad inside a drawn frame, good as an early return', () => {
    // good: an early return, a ternary return, a bare arrow body, a fragment that holds only the loader and a redirect
    expect(kinds(`function Page() { if (loading) return <ClarityPageLoader />; return <main/>; }`)).toEqual([]);
    expect(kinds(`function Page() { if (loading) { return (<ClarityPageLoader />); } return <main/>; }`)).toEqual([]);
    expect(kinds(`function Page() { return loading ? <ClarityPageLoader /> : <main/>; }`)).toEqual([]);
    expect(kinds(`const Page = () => <ClarityPageLoader />;`)).toEqual([]);
    expect(kinds(`function Page() { return <><Navigate to="/x" replace /><ClarityPageLoader /></>; }`)).toEqual([]);
    expect(kinds(`function Page() { return ready ? <main/> : null || <ClarityPageLoader />; }`)).toEqual([]);
    // bad: inside a div, a section, a conditional child of a drawn page, a component, an attribute value
    expect(kinds(`function Page() { return <div><h1>T</h1>{loading ? <ClarityPageLoader/> : <List/>}</div>; }`)).toEqual(['page-loader-in-frame']);
    expect(kinds(`function Page() { return <div>{loading && <ClarityPageLoader />}<List/></div>; }`)).toEqual(['page-loader-in-frame']);
    expect(kinds(`function Page() { if (loading) return <div className="p-4"><ClarityPageLoader /></div>; return <main/>; }`)).toEqual([
      'page-loader-in-frame',
    ]);
    expect(kinds(`function Page() { return <Layout><ClarityPageLoader /></Layout>; }`)).toEqual(['page-loader-in-frame']);
    // a fallback on anything but a Suspense is a frame around the loader
    expect(kinds(`function Page() { return <Boundary fallback={<ClarityPageLoader />}><List/></Boundary>; }`)).toEqual(['page-loader-in-frame']);
    // the shell's content loader and the boot loader are page loaders too
    expect(kinds(`function Page() { return <div><ClarityContentLoader /></div>; }`)).toEqual(['page-loader-in-frame']);
    expect(kinds(`function Page() { return <div><ClarityBootLoader /></div>; }`)).toEqual(['page-loader-in-frame']);
    // an aliased import
    expect(
      kinds(`import { ClarityPageLoader as Wait } from '@/components/ui/clarity-loader';\nfunction Page() { return <div><Wait /></div>; }`)
    ).toEqual(['page-loader-in-frame']);
    expect(
      kinds(`import { ClarityPageLoader as Wait } from '@/components/ui/clarity-loader';\nfunction Page() { if (x) return <Wait />; return <main/>; }`)
    ).toEqual([]);
  });

  it('6 a fragment with drawn siblings is a frame; a loader-only fragment is not (bypass closed)', () => {
    // bad: drawn elements, text, and a conditional list beside the loader, on either side of it
    expect(kinds(`function Page() { return <><h1>Title</h1><ClarityPageLoader /></>; }`)).toEqual(['page-loader-in-frame']);
    expect(kinds(`function Page() { return <><ClarityPageLoader /><List/></>; }`)).toEqual(['page-loader-in-frame']);
    expect(kinds(`function Page() { return (<><h1/><p/><ClarityPageLoader /></>); }`)).toEqual(['page-loader-in-frame']);
    expect(kinds(`function Page() { return <>Saving<ClarityPageLoader /></>; }`)).toEqual(['page-loader-in-frame']);
    expect(kinds(`function Page() { return <>{title}<ClarityPageLoader /></>; }`)).toEqual(['page-loader-in-frame']);
    expect(kinds(`function Page() { return <><Header/>{loading ? <ClarityPageLoader /> : <List/>}</>; }`)).toEqual(['page-loader-in-frame']);
    expect(kinds(`function Page() { return <>{x && <Banner/>}<ClarityPageLoader /></>; }`)).toEqual(['page-loader-in-frame']);
    // good: the loader alone, a redirect beside it, whitespace and comments, a ternary arm in a loader-only fragment
    expect(kinds(`function Page() { return <><ClarityPageLoader /></>; }`)).toEqual([]);
    expect(kinds(`function Page() { return <>\n  <ClarityPageLoader />\n</>; }`)).toEqual([]);
    expect(kinds(`function Page() { return <>{/* why */}<ClarityPageLoader /></>; }`)).toEqual([]);
    // screen-reader-only text beside the loader draws nothing (letter-response-confirm-page), visible text does
    expect(kinds(`function Page() { return <><ClarityPageLoader />{saving && (<p role="status" className="sr-only">Saving</p>)}</>; }`)).toEqual([]);
    expect(kinds(`function Page() { return <><ClarityPageLoader /><p className="sr-only">Saving</p></>; }`)).toEqual([]);
    expect(kinds(`function Page() { return <><ClarityPageLoader />{saving && (<p role="status">Saving</p>)}</>; }`)).toEqual(['page-loader-in-frame']);
    expect(kinds(`function Page() { return <><Navigate to="/x" replace />{wait && <ClarityPageLoader />}</>; }`)).toEqual([]);
    expect(kinds(`function Page() { return <>{loading ? <ClarityPageLoader /> : <List/>}</>; }`)).toEqual([]);
    // a nested fragment is judged by its own siblings, and by the outer ones
    expect(kinds(`function Page() { return <><><h1/><ClarityPageLoader /></></>; }`)).toEqual(['page-loader-in-frame']);
    expect(kinds(`function Page() { return <><h1/><><ClarityPageLoader /></></>; }`)).toEqual(['page-loader-in-frame']);
  });

  it('6 the loader\'s own element and a Suspense fallback are not frames (false positives closed)', () => {
    // good: a loader written with a closing tag, and a Suspense fallback (Suspense paints nothing)
    expect(kinds(`function Page() { return <ClarityPageLoader></ClarityPageLoader>; }`)).toEqual([]);
    expect(kinds(`function Page() { if (x) return <ClarityPageLoader></ClarityPageLoader>; return <main/>; }`)).toEqual([]);
    expect(kinds(`function Page() { return <Suspense fallback={<ClarityPageLoader />}><List/></Suspense>; }`)).toEqual([]);
    expect(kinds(`function Page() { return <React.Suspense fallback={<ClarityPageLoader />}><List/></React.Suspense>; }`)).toEqual([]);
    // bad: the same loader inside a drawn frame still fails, with a closing tag or around a Suspense
    expect(kinds(`function Page() { return <div><ClarityPageLoader></ClarityPageLoader></div>; }`)).toEqual(['page-loader-in-frame']);
    expect(kinds(`function Page() { return <div><Suspense fallback={<ClarityPageLoader />}><List/></Suspense></div>; }`)).toEqual([
      'page-loader-in-frame',
    ]);
    expect(kinds(`function Page() { return <><h1/><Suspense fallback={<ClarityPageLoader />}><List/></Suspense></>; }`)).toEqual([
      'page-loader-in-frame',
    ]);
    // bad: a non-fallback attribute on a Suspense, and a fallback on another component
    expect(kinds(`function Page() { return <Suspense name={<ClarityPageLoader />}><List/></Suspense>; }`)).toEqual(['page-loader-in-frame']);
    expect(kinds(`function Page() { return <Boundary fallback={<ClarityPageLoader />}><List/></Boundary>; }`)).toEqual(['page-loader-in-frame']);
  });
});

describe('P1586 loading-states guard — route derivation (controls on a scratch tree)', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'p1586-routes-'));
  const put = (f: string, text = 'export {};') => {
    mkdirSync(dirname(join(scratch, f)), { recursive: true });
    writeFileSync(join(scratch, f), text);
  };
  put('src/pages/A.tsx');
  put('src/pages/B.tsx');
  put('src/nested/index.tsx');
  put('src/nested/components/Child.tsx');
  put('src/nested/components/Other.tsx');
  put('src/pages/Hidden.tsx');
  put('src/app/routes/arr.ts');
  put('src/app/pages/Hidden.tsx');
  afterAll(() => rmSync(scratch, { recursive: true, force: true }));

  const app = `
    import { A } from '@/pages/A';
    import B from '@/pages/B';
    const Hidden = lazy(() => import('@/pages/Hidden').then(m => ({ default: m.Hidden })));
    function LocalRedirect() { return <Navigate to="/x" />; }
    export const R = () => (
      <Routes>
        <Route path="/a" element={<Layout><A /></Layout>} />
        <Route path="/b" element={<B />} />
        <Route path="/l" element={<LocalRedirect />} />
        <Route path="/n/*" element={<Nested />} />
      </Routes>
    );`;
  const nested = `
    import { Child } from './components/Child';
    import { Other } from './components/Other';
    export const N = () => (<Routes><Route path="c" element={<Child />} /></Routes>);`;
  const arr = `export const L = [{ path: '/h', Page: lazy(() => import('../pages/Hidden').then((m) => ({ default: m.Hidden }))) }];`;

  it('reads App-style imports (@/), a default import, and a component declared in the same file', () => {
    const got = deriveRoutedFromFile(scratch, 'src/App.tsx', app);
    expect(got.get('src/pages/A.tsx')).toContain('A');
    expect(got.get('src/pages/B.tsx')).toBe('*');
    expect(got.get('src/App.tsx')).toContain('LocalRedirect');
    // not named in any route element
    expect(got.get('src/pages/Hidden.tsx')).toBeUndefined();
  });

  it('reads a nested <Routes> file through RELATIVE imports', () => {
    const got = deriveRoutedFromFile(scratch, 'src/nested/index.tsx', nested);
    expect(got.get('src/nested/components/Child.tsx')).toContain('Child');
    // imported but never in a route element
    expect(got.get('src/nested/components/Other.tsx')).toBeUndefined();
  });

  it('reads a route array: every lazy() page in src/app/routes/ is routed, with a relative import', () => {
    const got = deriveRoutedFromFile(scratch, 'src/app/routes/arr.ts', arr);
    expect(got.get('src/app/pages/Hidden.tsx')).toContain('Hidden');
  });

  it('rendersRoutes finds a file that renders <Route element> and ignores one that only mentions it', () => {
    expect(rendersRoutes(nested)).toBe(true);
    expect(rendersRoutes(`// <Route element={x}> in a comment\nexport const A = 1;`)).toBe(false);
    expect(rendersRoutes(`import { Route } from 'r';\nexport const A = () => <Route path="x" />;`)).toBe(false);
  });

  it('a parser that finds nothing yields an empty map, so the src/ assertions below would fail', () => {
    expect(deriveRoutedFromFile(scratch, 'src/App.tsx', 'export const A = 1;').size).toBe(0);
  });
});

describe('P1586 loading-states guard — negative controls on real files (an allowed case passes)', () => {
  const root = process.cwd();
  const read = (f: string) => readFileSync(join(root, f), 'utf8');
  const kindsOf = (f: string, opts?: DetectOptions) => findLoadingDrift(f, read(f), opts).map(x => x.kind);

  it('1 the standard files really draw a large ClarityLoader; the exemption, not blindness, lets them pass', () => {
    expect(kindsOf('src/components/ui/clarity-loader.tsx')).toContain('large-clarity-loader');
    expect(kindsOf('src/components/ui/iframe-load-overlay.tsx')).toContain('large-clarity-loader');
    expect(kindsOf('src/components/ui/skeleton.tsx')).toContain('animate-pulse');
  });

  it('2 sr-only and aria "Loading …" text is not a loading look; an allowlisted operation label is seen', () => {
    expect(kindsOf('src/app/pages/chat/AttachmentSkeleton.tsx')).toEqual([]);
    expect(kindsOf('src/app/pages/chat/chat-kit.tsx')).not.toContain('loading-text');
    expect(kindsOf('src/app/pages/chat/MessageList.tsx')).toContain('loading-text');
    expect(ALLOWLIST['src/app/pages/chat/MessageList.tsx']?.counts['loading-text']).toBe(1);
    // prose and status values that contain the lowercase word are not loading text
    expect(read('src/app/components/letters/inbox-tab.tsx')).toContain('Something went wrong loading');
    expect(kindsOf('src/app/components/letters/inbox-tab.tsx')).not.toContain('loading-text');
  });

  it('3 a Loader2 inside a control passes', () => {
    const f = 'src/app/pages/settings-page.tsx';
    expect(read(f)).toContain('Loader2');
    expect(kindsOf(f)).not.toContain('loose-spinner');
  });

  it('4 a routed `if (!user) return null` is seen (and carries its reason in the allowlist)', () => {
    const f = 'src/app/pages/artifacts/artifacts-page.tsx';
    expect(read(f)).toMatch(/if \(!user\) return null;/);
    expect(kindsOf(f, { routedNames: new Set(['ArtifactsPage']) })).toContain('null-while-loading');
    expect(ALLOWLIST[f]?.counts['null-while-loading']).toBe(1);
    // a helper that is not the routed export is not checked
    expect(kindsOf(f, { routedNames: new Set(['NotAComponentInThisFile']) })).not.toContain('null-while-loading');
  });

  it('5 animate-pulse-subtle-green is not animate-pulse', () => {
    const f = 'src/app/components/profile/pledge-certificate-view.tsx';
    expect(read(f)).toContain('animate-pulse-subtle-green');
    expect(kindsOf(f)).not.toContain('animate-pulse');
  });

  it('6 a Back-only frame around the page loader is allowlisted with its reason; the migrated gates are clean', () => {
    expect(kindsOf('src/app/pages/video-summary-page.tsx')).toContain('page-loader-in-frame');
    expect(ALLOWLIST['src/app/pages/video-summary-page.tsx']?.counts['page-loader-in-frame']).toBe(1);
    for (const f of [
      'src/app/prototypes/events/components/EventRoomGate.tsx',
      'src/app/prototypes/events/components/EventRoomReady.tsx',
      'src/app/prototypes/events/components/EventDetail.tsx',
      'src/app/prototypes/events/components/CreateEvent.tsx',
    ]) {
      expect(kindsOf(f, { routedNames: '*' }), `${f} is migrated`).toEqual([]);
    }
  });
});

describe('P1586 loading-states guard — src/', () => {
  const root = process.cwd();
  const all = listSourceFiles(join(root, 'src')).map(f => relative(root, f).split(sep).join('/'));
  const files = all.filter(f => !(f in EXCLUDED_DEMOS));
  const routed = deriveRouted(root, all, f => readFileSync(join(root, f), 'utf8'));

  // Parsed once per file: the full scan and the stale check read the same results. Parsing all of src/ is the
  // cost, so the full scan carries an explicit timeout (under the full suite it ran past vitest's 15s default).
  const scanned = new Map<string, Finding[]>();
  const scan = (file: string): Finding[] => {
    if (file in STANDARD_FILES) return [];
    let found = scanned.get(file);
    if (!found) {
      found = findLoadingDrift(file, readFileSync(join(root, file), 'utf8'), { routedNames: routed.get(file) });
      scanned.set(file, found);
    }
    return found;
  };
  const countByKind = (found: Finding[]) => {
    const out: Partial<Record<Kind, number>> = {};
    for (const f of found) out[f.kind] = (out[f.kind] ?? 0) + 1;
    return out;
  };

  it('scans a real tree (the member lists are derived, not empty)', () => {
    expect(files).toContain('src/app/pages/org-page.tsx');
    expect(files).toContain('src/app/prototypes/events/components/EventRoomMeet.tsx');
    expect(files).toContain('src/components/ui/skeleton.tsx');
    expect(files.length).toBeGreaterThan(500);
    expect(files.some(f => f.endsWith('.test.tsx') || f.startsWith('src/tests/'))).toBe(false);
  });

  it('derives the routed set from every derivation path: App.tsx, the nested events <Routes>, and the route arrays', () => {
    // path 1: App.tsx (a lazy page, an eager wrapper, an events room page hoisted into App.tsx)
    expect(routed.get('src/app/pages/org-page.tsx')).toContain('OrgPage');
    expect(routed.get('src/app/pages/chat/ChatHomePage.tsx')).toBe('*');
    expect(routed.get('src/app/prototypes/events/components/EventRoomMeet.tsx')).toContain('EventRoomMeet');
    expect(routed.get('src/app/prototypes/events/arrival/EventArrivingPage.tsx')).toContain('EventArrivingPage');
    // path 2: the nested <Routes> in prototypes/events/index.tsx, through relative imports
    for (const [file, name] of [
      ['EventsList', 'EventsList'],
      ['CreateEvent', 'CreateEvent'],
      ['EventDetail', 'EventDetail'],
      ['EditEvent', 'EditEvent'],
      ['RsvpConfirm', 'RsvpConfirm'],
    ]) {
      expect(routed.get(`src/app/prototypes/events/components/${file}.tsx`), file).toContain(name);
    }
    expect(routed.get('src/app/prototypes/events/index.tsx')).toContain('EventsRoot');
    // path 3: the route arrays in src/app/routes/
    expect(routed.get('src/app/pages/hospitals-page.tsx')).toContain('HospitalsPage');
    expect(routed.get('src/app/pages/change-managers-page.tsx')).toContain('ChangeManagersPage');
    expect(routed.size).toBeGreaterThan(100);
    for (const file of routed.keys()) expect(existsSync(join(root, file)), `${file} routed but missing`).toBe(true);
  });

  it('the route-rendering files are themselves derived (App.tsx and the events router are found)', () => {
    const routeFiles = all.filter(f => rendersRoutes(readFileSync(join(root, f), 'utf8')));
    expect(routeFiles).toContain('src/App.tsx');
    expect(routeFiles).toContain('src/app/prototypes/events/index.tsx');
    expect(all.filter(f => f.startsWith('src/app/routes/')).length).toBeGreaterThan(2);
  });

  it('every excluded and standard path exists (no dead exclusions)', () => {
    for (const f of [...Object.keys(EXCLUDED_DEMOS), ...Object.keys(STANDARD_FILES)]) {
      expect(all, `${f} is excluded but no longer exists`).toContain(f);
    }
  });

  it('no loading state outside the four, beyond the allowlist (a count above the allowed one fails)', () => {
    const violations: string[] = [];
    for (const file of files) {
      const allowed = ALLOWLIST[file]?.counts ?? {};
      const seen: Partial<Record<Kind, number>> = {};
      for (const f of scan(file)) {
        seen[f.kind] = (seen[f.kind] ?? 0) + 1;
        if (seen[f.kind]! > (allowed[f.kind] ?? 0)) violations.push(`${file}:${f.line} [${f.kind}] ${f.text}`);
      }
    }
    expect(
      violations,
      'P1586 §1: a page waits with ClarityPageLoader, a section with <Skeleton>, a control with its own label or a small spinner inside it'
    ).toEqual([]);
  }, 60_000);

  it('every allowlist entry still exists, counts exactly what it lists, and names a reason (no stale entries)', () => {
    for (const [file, { counts, why }] of Object.entries(ALLOWLIST)) {
      expect(why.trim().length, `${file} has no reason`).toBeGreaterThan(20);
      expect(files, `${file} is allowlisted but no longer exists`).toContain(file);
      const found = countByKind(scan(file));
      for (const [kind, n] of Object.entries(counts)) {
        expect(n, `${file} lists '${kind}' with a non-positive count`).toBeGreaterThan(0);
        expect(found[kind as Kind] ?? 0, `${file}: allowlist says ${n} '${kind}', the file has a different number`).toBe(n);
      }
    }
  });
});
