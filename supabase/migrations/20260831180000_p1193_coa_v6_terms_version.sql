-- P1193 — admit COA version 6 ("Clarity Group Terms") on membership.terms_version.
--
-- WHY THIS MIGRATION EXISTS AT ALL. The Clarity Organization → Clarity Group rename
-- changes one field of the versioned terms record: its title. The oath body is
-- untouched (v6 references the same VERIFIED_UNDERSTANDING_OATH[5] object as v5 —
-- see src/app/content/coa-versions.ts). But the terms are versioned, and the version
-- a member accepted is recorded on their membership row, so a new title means a new
-- version, and a new version means this constraint has to admit it. The P1010
-- migration said as much in its own comment: "Bumping the live oath is a one-line
-- DEFAULT + CHECK change here."
--
-- WHAT THIS DOES NOT DO — and must never be made to do:
--   * No backfill. Every existing row keeps the terms_version it stored. Rewriting
--     '5' to '6' would change what people are on record as having accepted, which is
--     the exact thing the versioning exists to prevent.
--   * No removal of '4' or '5' from the CHECK. Both stay valid forever; rows pinned
--     to them must keep satisfying the constraint, and flipping CURRENT_COA_VERSION
--     back is meant to stay a one-constant rollback with no migration to revert.
--
-- terms_version is TEXT, not an integer — the values are the literal strings '4',
-- '5', '6'. Keep the quotes.

ALTER TABLE public.membership
  DROP CONSTRAINT IF EXISTS membership_terms_version_check;

ALTER TABLE public.membership
  ADD CONSTRAINT membership_terms_version_check
  CHECK (terms_version IN ('4', '5', '6'));

-- The DEFAULT is what a client insert that omits the column records, and
-- organizationsService.joinOrganization deliberately omits it so the SERVER decides
-- which terms version a join accepted. Moving it is therefore the change that makes
-- new joins record v6; the client is never trusted to name its own version.
ALTER TABLE public.membership
  ALTER COLUMN terms_version SET DEFAULT '6';
