-- P967: Harden get_my_listener_calibration_diffs() — revoke anon access
-- new function
-- client-safe: function was introduced in the same feature branch (20260627120000); no deployed client calls it yet
--
-- By default PostgreSQL grants EXECUTE to PUBLIC (which includes anon).
-- This patch explicitly revokes that so anon gets permission-denied (fail-closed)
-- rather than an empty result-set, matching the project's established pattern
-- (P877, P880, P898, P914, P904).

REVOKE ALL ON FUNCTION get_my_listener_calibration_diffs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_my_listener_calibration_diffs() TO authenticated;
