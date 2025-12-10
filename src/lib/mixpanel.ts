// Mixpanel wrapper for type-safe analytics tracking
// The Mixpanel snippet is loaded via index.html
// Only tracks in production to avoid polluting data with dev events

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

export const analytics = {
  track: (event: string, properties?: Record<string, unknown>) => {
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

