// Mixpanel wrapper for type-safe analytics tracking
// The Mixpanel snippet is loaded via index.html
// Only tracks in production to avoid polluting data with dev events
//
// P28.2: Also supports ML event collection - when a SessionEventsCollector is registered,
// ALL tracked events are automatically captured for ML training (future-proof).

import type { SessionEventsCollector } from './session-events-collector';

declare global {
  interface Window {
    mixpanel: {
      track: (event: string, properties?: Record<string, unknown>) => void;
      identify: (userId: string) => void;
      people: {
        set: (properties: Record<string, unknown>) => void;
      };
      reset: () => void;
    };
  }
}

const isProduction = import.meta.env.PROD;

// P28.2: ML event collection - registered collector receives ALL events automatically
let mlCollector: SessionEventsCollector | null = null;

export const analytics = {
  /**
   * Register an ML events collector. While registered, ALL tracked events
   * are automatically captured for ML training (not just live_* events).
   * Call unregisterMLCollector() when session ends.
   */
  registerMLCollector: (collector: SessionEventsCollector) => {
    mlCollector = collector;
    console.log('[Analytics] ML collector registered - all events will be captured');
  },

  /**
   * Unregister the ML events collector.
   */
  unregisterMLCollector: () => {
    mlCollector = null;
    console.log('[Analytics] ML collector unregistered');
  },

  track: (event: string, properties?: Record<string, unknown>) => {
    // P28.2: Capture for ML training if collector is registered and started
    if (mlCollector?.isStarted()) {
      mlCollector.addEvent(event, properties ?? {});
    }

    if (!isProduction) return;
    if (typeof window !== 'undefined' && window.mixpanel) {
      window.mixpanel.track(event, properties);
    }
  },

  identify: (userId: string) => {
    if (!isProduction) return;
    if (typeof window !== 'undefined' && window.mixpanel) {
      window.mixpanel.identify(userId);
    }
  },

  setUserProperties: (properties: Record<string, unknown>) => {
    if (!isProduction) return;
    if (typeof window !== 'undefined' && window.mixpanel) {
      window.mixpanel.people.set(properties);
    }
  },

  reset: () => {
    if (!isProduction) return;
    if (typeof window !== 'undefined' && window.mixpanel) {
      window.mixpanel.reset();
    }
  },
};

