/**
 * @file session-events-collector.ts
 * @description P28.1: Collects behavioral events during live sessions for ML training
 *
 * This utility captures a snapshot of all live_* events that occur during a session,
 * with timestamps relative to session start for easy audio alignment.
 */

/** Individual event captured during a session */
export interface MLEvent {
  /** Event name from Mixpanel (e.g., 'live_rating_submitted') */
  type: string;
  /** Milliseconds since sessionStartedAt (relative, for audio alignment - e.g., 45000 = 45s into recording) */
  timestamp: number;
  /** Event properties */
  properties: Record<string, unknown>;
}

/** Full session bundle for ML training */
export interface MLTrainingEvents {
  sessionCode: string;
  /** ISO timestamp when this snapshot was uploaded */
  capturedAt: string;
  /** Unix ms when eventsCollector.start() was called (recording began) */
  sessionStartedAt: number;
  /** Unix ms at snapshot time. For chunked uploads, this is snapshot time, not final session end. */
  sessionEndedAt: number;
  /** sessionEndedAt - sessionStartedAt */
  durationMs: number;
  participants: {
    name: string;
    role: 'creator' | 'joiner';
  }[];
  events: MLEvent[];
  /** Uploader's auth info (if logged in) - for analytics correlation */
  uploader?: {
    supabaseUserId?: string;  // Supabase auth.users.id - same value passed to Mixpanel identify()
    email?: string;           // User email for manual lookup
    name: string;             // Display name used in session
  };
}

/**
 * Collects behavioral events during a live session for ML training.
 *
 * Usage:
 * ```ts
 * const collector = new SessionEventsCollector();
 *
 * // On session join/create:
 * collector.start();
 *
 * // During session, capture events:
 * collector.addEvent('live_rating_submitted', { rating: 8, role: 'checker' });
 *
 * // On session end:
 * const events = collector.getEvents();
 * const metadata = {
 *   sessionStartedAt: collector.getStartTime(),
 *   sessionEndedAt: Date.now(),
 *   durationMs: collector.getDurationMs(),
 *   participants: [{ name: 'Alice', role: 'creator' }, { name: 'Bob', role: 'joiner' }],
 * };
 * await uploadSessionRecording(sessionCode, userName, audioBlob, events, metadata);
 * ```
 */
export class SessionEventsCollector {
  private events: MLEvent[] = [];
  private startTime: number = 0;

  /**
   * Start collecting events. Call this when session begins.
   */
  start(): void {
    this.startTime = Date.now();
    this.events = [];
    // eslint-disable-next-line no-console -- test-asserted diagnostic (session-events-collector.test.ts); gated so it never runs in prod (P1200)
    if (import.meta.env.DEV) console.log('[EventsCollector] Started collecting at', new Date(this.startTime).toISOString());
  }

  /**
   * Add an event to the collection.
   * @param type - Event name (e.g., 'live_rating_submitted')
   * @param properties - Event properties
   */
  addEvent(type: string, properties: Record<string, unknown>): void {
    if (this.startTime === 0) {
      console.warn('[EventsCollector] addEvent called before start()');
      return;
    }

    const event: MLEvent = {
      type,
      timestamp: Date.now() - this.startTime,
      properties,
    };

    this.events.push(event);
    // eslint-disable-next-line no-console -- test-asserted diagnostic (session-events-collector.test.ts); gated so it never runs in prod (P1200)
    if (import.meta.env.DEV) console.log('[EventsCollector] Captured event:', type, 'at', event.timestamp, 'ms');
  }

  /**
   * Get all collected events.
   */
  getEvents(): MLEvent[] {
    return [...this.events];
  }

  /**
   * Get the session start time (Unix ms).
   */
  getStartTime(): number {
    return this.startTime;
  }

  /**
   * Get the duration in milliseconds.
   */
  getDurationMs(): number {
    return this.startTime > 0 ? Date.now() - this.startTime : 0;
  }

  /**
   * Check if collection has started.
   */
  isStarted(): boolean {
    return this.startTime > 0;
  }

  /**
   * Get metadata for the current collection session.
   * Used by uploadEventsSnapshot for chunked event uploads.
   */
  getMetadata(): { sessionStartedAt: number; participants: { name: string; role: 'creator' | 'joiner' }[] } {
    return {
      sessionStartedAt: this.startTime,
      participants: [], // Will be filled by caller with session info
    };
  }

  /**
   * Reset the collector for a new session.
   */
  reset(): void {
    this.events = [];
    this.startTime = 0;
    // eslint-disable-next-line no-console -- test-asserted diagnostic (session-events-collector.test.ts); gated so it never runs in prod (P1200)
    if (import.meta.env.DEV) console.log('[EventsCollector] Reset');
  }
}
