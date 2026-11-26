/**
 * @file api-result.ts
 * @description Result type for data operations that can fail with different error types. Its own
 * module (P1297) so api.ts, already over the size limit, does not grow; api.ts re-exports it.
 */
export type ApiResult<T> =
  | { success: true; data: T }
  | {
      success: false;
      error: 'not_found' | 'server_error';
      message?: string;
      /** P1297: set on a server_error that got an HTTP answer — tells a refused token (401) from an unreachable server. */
      status?: number;
      code?: string;
      /** P1297: the read threw in our own code (postgrest-js returns network failures, never throws), so it will repeat. */
      thrown?: boolean;
    };
