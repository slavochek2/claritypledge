// Debug logging - only in development
const DEBUG = import.meta.env.DEV;
// eslint-disable-next-line no-console -- gated by DEBUG (import.meta.env.DEV); dev-only diagnostic (P1200)
export const log = (...args: unknown[]) => DEBUG && console.log('[letters-service]', ...args);
