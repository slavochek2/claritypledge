// P1655: explicit renames of a fault's fingerprint (`<check>:<fault key>`): old -> new.
//
// P1605 records match on the exact fingerprint, so a check that renames its key would show an
// already-evaluated cause again as "came back". A record filed under an old fingerprint also hides
// the card under its alias. An alias joins two fingerprints only when they are the same cause, so
// each line is reviewed by hand; nothing is inferred. The guard test (day-p1655.test.ts) fails when
// an emitted fault key disappears from the check prose without an entry here.
export const FP_ALIASES: Record<string, string> = {
  // 2026-11-10: project name -> org id
  'cp.quota:quota:claritypledge-test:log-ingestion': 'cp.quota:quota:jwpujlzsdkkeohiggxpt:log-ingestion',
  // 2026-11-10: the check moved from cp.health to cp.reflect
  'cp.health:kdd:uncaptured': 'cp.reflect:kdd:uncaptured',
  // 2026-11-10: renamed
  'cp.testfns:testfns:branch-only-deploy': 'cp.testfns:testfns:differs',
  // P1655 rule 3: the LinkedIn stall now carries its cause; the one stall on file was out of credits
  'disp.lhcodex:lhcodex:needs-you': 'disp.lhcodex:lhcodex:needs-you:out-of-credits',
}
