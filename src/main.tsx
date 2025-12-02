import React from "react";
import * as ReactDOM from "react-dom";
import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App";
import "./index.css";

// Initialize Sentry for error tracking (production only)
const sentryDsn = import.meta.env.VITE_SENTRY_DSN;

if (sentryDsn && import.meta.env.PROD) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,

    // Privacy: Do NOT send PII without explicit user consent
    sendDefaultPii: false,

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
