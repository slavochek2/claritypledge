import React from "react";
import * as ReactDOM from "react-dom";
import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App";
import "./index.css";

// Initialize Sentry for error tracking
Sentry.init({
  dsn: "https://ae54b9481a99fa1ef834253a1b212621@o4510465553072128.ingest.de.sentry.io/4510465564868688",

  // Only enable in production
  enabled: import.meta.env.PROD,

  // Set environment
  environment: import.meta.env.MODE,

  // Enable structured logging
  _experiments: {
    enableLogs: true,
  },

  // Send default PII data (IP address collection)
  sendDefaultPii: true,

  // Performance monitoring
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration({
      // Capture 10% of sessions, 100% of sessions with errors
      maskAllText: false,
      blockAllMedia: false,
    }),
  ],

  // Performance Monitoring - sample rate for production
  tracesSampleRate: 0.1, // 10% of transactions

  // Session Replay - sample rates
  replaysSessionSampleRate: 0.1, // 10% of sessions
  replaysOnErrorSampleRate: 1.0, // 100% of sessions with errors
});

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
