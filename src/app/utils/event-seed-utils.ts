/**
 * Convert a wall-clock time in a named IANA timezone to a UTC ISO string.
 *
 * Uses the epoch-inversion trick:
 * 1. Treat the wall-clock fields as a naive UTC epoch.
 * 2. Format that epoch in the target timezone via Intl to read the local time it represents.
 * 3. The delta between (2) and (1) is the timezone's UTC offset at that moment.
 * 4. Subtract the offset from the naive epoch to get the actual UTC epoch.
 *
 * Handles DST correctly because Intl resolves the offset from the IANA database
 * for the specific epoch, not from a fixed seasonal rule.
 *
 * Ambiguous wall-clock times (the "fall-back" hour when clocks repeat): the algorithm
 * always resolves to the DST (first/earlier) occurrence. For seeding events at fixed
 * business hours (e.g., 10:30) this is irrelevant — only relevant if called with a
 * time that falls inside the DST-end window (e.g., 02:30 Berlin on the transition day).
 */
export function wallClockToUTC(
  tz: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): string {
  // Step 1: naive epoch — treats wall-clock fields as if they were UTC
  const naiveEpoch = Date.UTC(year, month - 1, day, hour, minute, 0);

  // Step 2: decompose naiveEpoch into local time parts via Intl (no string-parsing)
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(naiveEpoch).map((p) => [p.type, p.value]),
  );
  // hour12: false can produce "24" for midnight — normalise to 0
  const localHour = Number(parts.hour) % 24;
  const tzEpoch = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    localHour,
    Number(parts.minute),
    Number(parts.second),
  );

  // Step 3: actual UTC = naiveEpoch − (tzEpoch − naiveEpoch) = 2·naiveEpoch − tzEpoch
  return new Date(2 * naiveEpoch - tzEpoch).toISOString();
}
