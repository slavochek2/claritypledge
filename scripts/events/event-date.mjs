#!/usr/bin/env node
/**
 * event-date.mjs — P1367 S2. An event date is chosen, not guessed, and a slug never lies about it.
 *
 * WHY. On Monday 2026-09-28 the founder asked for "next Tuesday". That has two answers (29 Sep
 * and 6 Oct). The agent picked 6 Oct and said so; a compaction three seconds later dropped it,
 * and by the afternoon TEST, docs/goals.md and the slug held three different stories. Separately,
 * scripts/create-event.ts stamped PROD slugs with the CREATION date, so a slug's date never
 * tracked the event.
 *
 *   node scripts/events/event-date.mjs resolve --today 2026-09-28 [--time 18:30] [--pick N] "next Tuesday"
 *     Prints every reading with weekday, date and Bangkok time. More than one reading and no
 *     --pick: exit 3, and the caller must not write. One reading (or a pick): exit 0 and a
 *     DATETIME=<UTC ISO> line when --time was given.
 *
 *   node scripts/events/event-date.mjs check <slug> <datetime> [timezone]
 *   node scripts/events/event-date.mjs check --env test|prod <slug>
 *     Exit 1 when the date inside the slug differs from the event's local date.
 *
 * Output contract: status lines use ':' as separator, never '>' '<' or '|' (shell-safety.md).
 */

export const TZ = 'Asia/Bangkok'
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** Pure date arithmetic on calendar dates (YYYY-MM-DD), in UTC so no host timezone leaks in. */
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)) }
const ymd = dt => dt.toISOString().slice(0, 10)
const addDays = (dt, n) => new Date(dt.getTime() + n * 86400000)

/** Bangkok has no DST: local = UTC + 7. Kept explicit rather than host-dependent. */
const OFFSET_H = 7

export function describe(dateStr, time) {
  const dt = parseYmd(dateStr)
  const weekday = DAYS[dt.getUTCDay()][0].toUpperCase() + DAYS[dt.getUTCDay()].slice(1)
  const label = `${weekday} ${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()][0].toUpperCase()}${MONTHS[dt.getUTCMonth()].slice(1)} ${dt.getUTCFullYear()}`
  if (!time) return { date: dateStr, label: `${label}, time not given`, datetime: null }
  const [hh, mm] = time.split(':').map(Number)
  const utc = new Date(dt.getTime() + (hh - OFFSET_H) * 3600000 + mm * 60000)
  return { date: dateStr, label: `${label}, ${time} Bangkok`, datetime: utc.toISOString().replace('.000Z', '+00:00') }
}

/**
 * @returns {{candidates: string[], reason: string}} candidate YYYY-MM-DD dates, in order
 */
export function readings(input, today) {
  const s = input.trim().toLowerCase().replace(/\s+/g, ' ')
  const t = parseYmd(today)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return { candidates: [s], reason: 'absolute date' }
  if (s === 'today') return { candidates: [today], reason: 'today' }
  if (s === 'tomorrow') return { candidates: [ymd(addDays(t, 1))], reason: 'tomorrow' }
  // "6 oct", "6 october 2026", "october 6", "oct 6 2026"
  const dm = s.match(/^(\d{1,2}) ([a-z]+)(?: (\d{4}))?$/) ?? null
  const md = s.match(/^([a-z]+) (\d{1,2})(?:,? (\d{4}))?$/) ?? null
  const parts = dm ? { d: dm[1], m: dm[2], y: dm[3] } : md ? { d: md[2], m: md[1], y: md[3] } : null
  if (parts) {
    const mi = MONTHS.indexOf(parts.m.slice(0, 3))
    if (mi >= 0) {
      let y = parts.y ? Number(parts.y) : t.getUTCFullYear()
      let c = new Date(Date.UTC(y, mi, Number(parts.d)))
      if (!parts.y && c < t) c = new Date(Date.UTC(y + 1, mi, Number(parts.d)))
      return { candidates: [ymd(c)], reason: 'absolute date' }
    }
  }
  const wd = s.match(/^(next |this |coming )?([a-z]+)$/)
  if (wd) {
    const di = DAYS.findIndex(d => d.startsWith(wd[2].slice(0, 3)) && wd[2].length >= 3)
    if (di >= 0) {
      const ahead = (di - t.getUTCDay() + 7) % 7
      // The named weekday is TODAY: "Monday" said on a Monday is today or a week out. Both are
      // printed, whatever the prefix (review, 2026-09-28: it used to answer "next week" silently).
      if (ahead === 0) return { candidates: [today, ymd(addDays(t, 7))], reason: `"${s}" said on a ${DAYS[di]}: today or in a week` }
      const coming = addDays(t, ahead)
      // "next <weekday>" is read two ways in English: the coming one, or the one in the
      // following week. Both are printed; the founder picks.
      if (wd[1] === 'next ') return { candidates: [ymd(coming), ymd(addDays(coming, 7))], reason: `"next ${DAYS[di]}" has two readings` }
      return { candidates: [ymd(coming)], reason: `the coming ${DAYS[di]}` }
    }
  }
  return { candidates: [], reason: `cannot read "${input}" as a date; give YYYY-MM-DD` }
}

/** The event's calendar date in its own timezone. */
export function localDate(datetime, timeZone = TZ) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(datetime))
}

/** The date a slug claims: `<title>-YYYY-MM-DD` with an optional 4-char random suffix. */
export function slugDate(slug) {
  return slug.match(/-(\d{4}-\d{2}-\d{2})(?:-[a-z0-9]{4})?$/)?.[1] ?? null
}

export function checkSlugDate(slug, datetime, timeZone = TZ) {
  const claimed = slugDate(slug)
  const actual = localDate(datetime, timeZone)
  if (!claimed) return { ok: false, detail: `slug-date: FAIL: no date in slug "${slug}"` }
  return claimed === actual
    ? { ok: true, detail: `slug-date: OK: ${slug} carries ${actual}, the event's local date` }
    : { ok: false, detail: `slug-date: FAIL: slug says ${claimed}, event is ${actual} (${timeZone})` }
}

/** The slug create-event.ts writes: title, the EVENT's local date, a random suffix. */
export function eventSlug(title, datetime, timeZone = TZ, suffix = Math.random().toString(36).slice(2, 6)) {
  const titleSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `${titleSlug}-${localDate(datetime, timeZone)}-${suffix}`
}

async function fetchRow(env, slug) {
  const { readFileSync } = await import('node:fs')
  const vars = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')] }))
  // Anon keys only: these are public, read-only (credentials.md routine half).
  const [url, key] = env === 'prod'
    ? ['https://besjtuodziykmjidubzw.supabase.co', vars.PROD_SUPABASE_ANON_KEY]
    : [vars.VITE_SUPABASE_URL, vars.VITE_SUPABASE_ANON_KEY]
  const r = await fetch(`${url}/rest/v1/events?slug=eq.${encodeURIComponent(slug)}&select=slug,datetime,timezone`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
  const rows = await r.json()
  if (!Array.isArray(rows) || !rows.length) throw new Error(`no event "${slug}" on ${env}`)
  return rows[0]
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, ...rest] = process.argv.slice(2)
  const opt = name => { const i = rest.indexOf(name); if (i < 0) return null; const v = rest[i + 1]; rest.splice(i, 2); return v }
  if (cmd === 'resolve') {
    const today = opt('--today') ?? ymd(new Date(Date.now() + OFFSET_H * 3600000))
    const time = opt('--time')
    const pick = opt('--pick')
    const input = rest.join(' ')
    const { candidates, reason } = readings(input, today)
    console.log(`resolve: "${input}" on ${describe(today).label.replace(', time not given', '')}: ${reason}`)
    if (!candidates.length) process.exit(2)
    candidates.forEach((c, i) => console.log(`  ${i + 1}. ${describe(c, time).label}`))
    let chosen = candidates.length === 1 ? candidates[0] : null
    if (pick) {
      chosen = candidates[Number(pick) - 1] ?? null
      if (!chosen) { console.log(`resolve: FAIL: --pick ${pick} is not one of the readings`); process.exit(2) }
    }
    if (!chosen) {
      console.log('resolve: BLOCKED: more than one reading. Ask the founder which, then re-run with --pick N. Write nothing until then.')
      process.exit(3)
    }
    const d = describe(chosen, time)
    console.log(`CHOSEN=${d.label}`)
    if (d.datetime) console.log(`DATETIME=${d.datetime}`)
    process.exit(0)
  }
  if (cmd === 'check') {
    const env = opt('--env')
    let slug, datetime, tz
    if (env) { const row = await fetchRow(env, rest[0]); [slug, datetime, tz] = [row.slug, row.datetime, row.timezone ?? TZ] }
    else [slug, datetime, tz = TZ] = rest
    if (!slug || !datetime) { console.error('usage: event-date.mjs check <slug> <datetime> [tz] | check --env test|prod <slug>'); process.exit(2) }
    const r = checkSlugDate(slug, datetime, tz)
    console.log(r.detail)
    process.exit(r.ok ? 0 : 1)
  }
  console.error('usage: event-date.mjs resolve|check …  (see header)')
  process.exit(2)
}
