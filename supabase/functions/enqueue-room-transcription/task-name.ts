/** Cloud Tasks task names allow letters, digits, hyphens and underscores. */
const ATTEMPT_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function validAttempt(value: unknown): value is string {
  return typeof value === 'string' && ATTEMPT_RE.test(value);
}

/**
 * Room jobs keep `room-job-{id}` (a duplicate trigger fire is deduplicated). A round-clean dispatch carries a
 * per-dispatch `attempt` marker, so a redispatch of the same job id after a retry is a new task, not a swallowed
 * duplicate (Cloud Tasks refuses to reuse a name).
 */
export function taskName(parent: string, jobId: string, attempt?: string): string {
  return `${parent}/tasks/room-job-${jobId}${attempt ? `-${attempt}` : ''}`;
}
