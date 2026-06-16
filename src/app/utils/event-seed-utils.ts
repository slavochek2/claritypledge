// P943 stub: naive DST-unaware implementation — the /fix for P943 replaces this
// with a DST-aware computation (see features/p943_webinar_dst_wrong_winter_time.md)

export function wallClockToUTC(
  _tz: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): string {
  // WRONG: applies fixed UTC-2 offset regardless of DST (only correct for CEST summer)
  // Winter sessions (post DST end) need UTC-1, producing 09:30Z not 08:30Z for 10:30 Berlin
  const wrongUtcHour = hour - 2;
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  const hh = String(wrongUtcHour).padStart(2, '0');
  const mi = String(minute).padStart(2, '0');
  return new Date(`${year}-${mm}-${dd}T${hh}:${mi}:00.000Z`).toISOString();
}
