// P1655 rule 3: the cause slug the LinkedIn machine check adds to its fault key, from the text the
// check printed (the runner's campaign state / screen title). Unreadable or unrecognised is
// `unknown`: today's card, never a hidden one.
//
//   echo "<the check's problem lines>" | npx tsx scripts/day-lh-cause.ts   -> prints the slug
import { pathToFileURL } from 'url'

export function lhCauseSlug(text: string): string {
  const t = (text ?? '').toLowerCase()
  if (/\b(crash|crashed|tooling-failure|interrupted|unknown-rc)/.test(t)) return 'crashed'
  if (/out of (data )?credits/.test(t)) return 'out-of-credits'
  return 'unknown'
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let buf = ''
  process.stdin.on('data', (d) => (buf += d))
  process.stdin.on('end', () => process.stdout.write(`${lhCauseSlug(buf)}\n`))
}
