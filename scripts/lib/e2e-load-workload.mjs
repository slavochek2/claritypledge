/**
 * The fixed workload: no metered service anywhere in these specs or the e2e helpers they import, and every
 * spec passes at level 1 (three specs that failed on this server's data at level 1 were taken out: they
 * would count as load failures at every higher level). Two more were taken out after level 2 showed they
 * fail only when two runs overlap, for a reason that is not load: p1083-ready-distribution counts rows of a
 * table every run writes to (now marked e2e-exclusive), and p1314c-release-requires-seat-secret named its fixture
 * session by the millisecond clock (since fixed). They are cross-run collisions, reported in the P1607 spec.
 * Changing this list changes what the load-test switch accepts: the switch compares a run's specs to it.
 */
export const WORKLOAD = [
  'e2e/p1077-ready.spec.ts',
  'e2e/p951-pricing-routing.spec.ts',
  'e2e/p508-partner-template.spec.ts',
  'e2e/p1193-groups-rename.spec.ts',
  'e2e/integration/p1212-agent-slug-reservation.spec.ts',
  'e2e/integration/p1083-db-schema.spec.ts',
  // Creates users and signs them in: the auth service (and its rate limit) is part of the load.
  'e2e/p496-auth-context.spec.ts',
  'e2e/p555-auth-fast-path.spec.ts',
];
