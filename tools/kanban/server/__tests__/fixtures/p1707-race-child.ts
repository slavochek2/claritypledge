// P1707 review A: one racer for day-p1707-review.test.ts. Waits on a barrier file, then records a
// confirm for each of N insights through the shared rule, and prints the results as JSON.
import { existsSync, writeFileSync } from 'fs'
import { recordInsightDecision } from '../../analyticsStore'

const [dir, barrier, ready, n] = process.argv.slice(2)
writeFileSync(ready, '')
while (!existsSync(barrier)) {
  // spin: both racers leave the barrier within a millisecond of each other
}
const out: string[] = []
for (let k = 0; k < Number(n); k++) out.push(await recordInsightDecision(dir, `k${k}`, 'confirm', new Date()))
process.stdout.write(JSON.stringify(out))
