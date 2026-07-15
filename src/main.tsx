import React from "react";
import * as ReactDOM from "react-dom";
import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import LogRocket from "logrocket";
import "@/lib/mixpanel"; // Initialize Mixpanel + fire test event
import { dropServiceWorkerRegistrationNoise, IGNORED_ERROR_PATTERNS } from "@/lib/sentry-filters";
import App from "./App";
import "./index.css";

// Initialize Sentry for error tracking (production only)
const sentryDsn = import.meta.env.VITE_SENTRY_DSN;

// P553: Defer LogRocket init until after first paint to avoid blocking render
if (import.meta.env.PROD) {
  const initLogRocket = () => LogRocket.init("alblur/claritypledge");
  if ('requestIdleCallback' in window) {
    requestIdleCallback(initLogRocket);
  } else {
    setTimeout(initLogRocket, 2000);
  }
}

if (sentryDsn && import.meta.env.PROD) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,

    // Privacy: Do NOT send PII without explicit user consent
    sendDefaultPii: false,

    // Filter out noise from browser/extension issues we can't fix.
    // The pattern list lives in lib/sentry-filters so it can be unit-tested;
    // see IGNORED_ERROR_PATTERNS there for the per-pattern rationale.
    ignoreErrors: IGNORED_ERROR_PATTERNS,

    // P882: Frame-based filtering for noise that ignoreErrors (message-based)
    // can't match — e.g. SW registration rejections whose message is just "Rejected"
    beforeSend: dropServiceWorkerRegistrationNoise,

    // Performance monitoring
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        // Privacy: Mask all text and block media in replays
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],

    // Performance Monitoring - sample rate for production
    tracesSampleRate: 0.1, // 10% of transactions

    // Session Replay - reduced sampling, only on errors
    replaysSessionSampleRate: 0, // Disabled for privacy - only capture on errors
    replaysOnErrorSampleRate: 1.0, // 100% of sessions with errors (masked)
  });
}

// Make React and ReactDOM globally available immediately (not in useEffect)
window.React = React;
window.ReactDOM = ReactDOM;

// eslint-disable-next-line react-refresh/only-export-components
function Main() {
  return (
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

const root = createRoot(document.getElementById("root") as HTMLElement);
root.render(<Main />);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
