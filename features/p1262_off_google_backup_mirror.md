---
status: backlog
type: task
disclosure: public
rank: 1000092
workstream: infrastructure
created_date: '2026-09-07'
tags: [backups, disaster-recovery, infrastructure, gcs]
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
---

# P1262: The only DB backup lives in the provider we are hedging against

## Problem

**Situation:** Primary data lives in Supabase, code in GitHub, hosting on Vercel — none of
which is Google. `db-backup.yml` dumps prod nightly at 03:00 UTC to
`gs://claritypledge-db-backups/`, 7-day retention via a GCS lifecycle rule. The GCS buckets
also hold session audio (`claritypledge-ml-training`) and story images
(`claritypledge-story-images` — `src/app/components/landing/founder-credibility.tsx:26`
records these are deliberately not committed to the repo).

**Complication:** The backup shares a failure domain with the risk it insures against. If the
GCP project becomes unreachable — suspension, billing dispute, a deleted credential — we lose
read access to the *only* copy of the dump during exactly the window we would need it. This is
not hypothetical for this account: `p1031_google_oauth_client_deleted_signin_broken.md` records
a Google-side credential disappearing under us already.

**Question:** Where does a second, independent copy of the dump live — and is that all we need,
or do the media buckets need the same treatment?

> Founder framing, verbatim: *"maybe in all inkl ew can have some db ? or to dropbox`? can you
> file a spec to think aobut it later and do it later"*
>
> and, opening the thread: *"If Google turns off tomorrow, can we still reclaim the data and
> rebuild stuff in some other cloud provider? ... Are we prepared or not?"*

**Framing correction worth preserving:** the founder asked for a *database*. What the risk
actually calls for is a second copy of the *dump file* — a running Postgres elsewhere would be
a replica to maintain, monitor and secure, and it does not make the existing dump any more
reachable. Both options are kept live in Research Questions rather than settled here.

## Appetite

**Blast radius:** high in consequence, narrow in surface — one workflow file and one new
credential, but it is the artifact every recovery path depends on.
**Reversibility:** high. A mirror step is additive; deleting it restores today's behaviour
exactly. Nothing existing changes semantics.
**Decision density:** one real founder call (which provider, on cost and trust), plus one
scope call (dump only, or media too).

## Invariants

- The mirror is **additive**. GCS stays the primary destination and its behaviour is unchanged;
  a mirror failure must not fail the backup job or mask a GCS success. (Corollary: the mirror
  step's failure has to be *visible* — see Risks.)
- **The `.verified` marker travels with the object, or the mirror is not restorable.**
  `docs/technical/db-restore.md` makes the marker the sole selector of a usable backup, because
  a truncated `pg_dump` still produces a valid-gzip, correctly-named, plausibly-sized object.
  A mirror holding dumps without markers reproduces the exact poison-object trap P991 closed.
- The mirror credential is **append-only where the provider can express it**. P991/P998 spent
  real effort reducing the GCS writer to create-only with no delete and no list; a mirror
  credential with delete permission hands back, on a new provider, the blast radius that work
  removed. Where a provider cannot express append-only, that is a finding to report, not a
  detail to skip.
- Alerting on mirror failure routes to a **GitHub issue consumed by `/day`**, never to the
  founder's inbox (`decisions.md` 2026-07-15 [process], the P866 pattern).

## Approach

Evaluate candidate destinations against pre-registered criteria, pick one, then add a mirror
step to `.github/workflows/db-backup.yml` that copies the verified dump *and* its `.verified`
sidecar to the chosen destination after the existing verification steps pass.

Deliberately **not** designed here — the destination determines the mechanism (rclone vs
provider SDK vs plain FTPS), and the point of this spec is to decide that first.

[FOUNDER DECISION: which destination. This is a cost-and-trust call, not a technical one —
All-Inkl is an account you already pay for and control; Dropbox is a consumer product holding
production user data; R2/B2 are new vendors with the best technical fit and a small new bill.
The criteria below will narrow it, but the final pick is yours.]

## Research Questions

1. **Does All-Inkl offer anything that can hold this?** The account (`w00dd4f1`) has web
   storage and FTP. UNVERIFIED whether its quota accommodates a growing dump series, and
   whether KAS-managed databases are Postgres or MySQL only — if MySQL only, the "have some db
   in All-Inkl" reading of the founder's question is closed and only file storage remains.
   Infra doc: `pp/docs/infra/all-inkl.md`.
2. **Can each candidate be written to from GitHub Actions non-interactively**, with a
   credential scoped narrowly enough to satisfy the append-only invariant?
3. **Is Dropbox acceptable for production user data at all?** A prod dump contains every
   profile, session and transcript. Check against the ToS/privacy commitments in
   `docs/technical/` and the data-rights spec (`features/done/3_2_jan26/p42_data_rights.md`)
   before treating it as a live option.
4. **Does the media scope belong in this spec or a successor?** Session audio and story images
   are irreplaceable and currently single-copy, but they are far larger than a ~1MB dump and
   have a different cost curve.
5. **What is the retention story on the mirror?** GCS ages objects out at 7 days via lifecycle
   rule. A mirror with no expiry grows forever; one with delete permission violates an
   invariant. How does the chosen provider express this?

## Decision Criteria

Pre-registered — write the answer these produce, do not re-derive the bar after looking.

1. **Which destination?** → Pick the one that (a) accepts an automated write from GitHub
   Actions, (b) can hold ≥14 days of dumps within existing or trivial cost, and (c) is not
   Google. If more than one qualifies, prefer the one whose credential can be scoped
   append-only. If that still ties, prefer the account we already pay for.
2. **Is Dropbox eliminated?** → Eliminated if RQ3 finds any conflict with our stated data
   handling. Not a close call — if there is doubt, it is out.
3. **Does media get mirrored now?** → Yes only if total media size fits the chosen destination
   without a new paid tier. Otherwise DEFER to a successor spec and say so explicitly rather
   than silently dropping it.
4. **Is the mirror trustworthy?** → Only once a restore has been performed *from the mirror
   copy*, not from GCS. An untested mirror is a belief, not a backup — this is the whole lesson
   of P997.

## Time Box

Investigation (RQ1-5 + the decision): one focused session. If All-Inkl's capabilities cannot be
established from the KAS panel and `pp/docs/infra/all-inkl.md` within that box, drop it as a
candidate rather than extending — R2/B2 are known-good fallbacks and the risk being closed here
does not justify an open-ended provider hunt.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Mirror step fails silently; we believe we have two copies and have one | MITIGATE | The mirror's own success must be asserted and alerted on. Note `decisions.md` 2026-07-15: object-count alerting is structurally blind to a job that never ran — a count check on the mirror inherits that blindness and is not sufficient on its own. |
| Second credential = second thing to rotate and leak | MITIGATE | Scope append-only; register it in `.private/docs/accounts.md`; fold into the P1148 rotation system rather than standing outside it. |
| All-Inkl credential proves unreliable in CI | ACCEPT | Known precedent — SMTP auth returned `535` against this same account (`decisions.md`, Mailgun adopted instead). Acceptable *because* the mirror is additive: if it breaks, GCS is untouched. It does mean All-Inkl carries a reliability discount in criterion 1. |
| Mirroring a full prod dump widens where user PII lives | MITIGATE | Feeds directly into RQ3; the destination's jurisdiction and access model are part of the decision, not an afterthought. |
| Mirror grows unbounded without a lifecycle equivalent | DEFER | RQ5 settles this; do not implement a delete-capable credential to solve it. |
| Media buckets stay single-copy after this ships | DEFER | Unblocked by criterion 3. Must be named in the closing report either way — this spec must not leave the impression that audio and images are covered when they are not. |

**Non-Goals**
- Do NOT change GCS as the primary backup destination, its lifecycle rule, or the writer SA's
  permissions. P991/P998 tuned those deliberately.
- Do NOT move transcription off Cloud Run, or swap Gemini for another image provider. Those are
  feature-availability concerns, not data-loss concerns, and belong in their own specs.
- Do NOT build a general storage abstraction layer over GCS. Full provider portability was
  considered and rejected in the originating conversation — the GCP credit makes it a net cost.
- Do NOT set up a live Postgres replica anywhere. If RQ1 finds All-Inkl Postgres, that is
  information for the decision, not a mandate to run a second database.

## Done-When

- [ ] RQ1-5 answered in writing, each with the command or console page that answered it
- [ ] Destination chosen and the reason recorded against the pre-registered criteria
- [ ] `db-backup.yml` writes the dump **and** its `.verified` sidecar to the second destination
      after existing verification passes
- [ ] A deliberately failed mirror step produces a non-zero exit and a GitHub issue — exit code
      pasted, per `.claude/rules/epistemic.md` gate 7 (a mirror that has never been seen to
      fail is unproven)
- [ ] A successful backup run still passes end-to-end with the mirror step present — the
      existing workflow's own path, run unmodified through the new step (gate 7c)
- [ ] A restore performed **from the mirror copy**, following `db-restore.md`, reaching the same
      row counts the marker claims
- [ ] `docs/technical/db-restore.md` updated with the second destination and which to prefer
- [ ] Media-bucket scope explicitly resolved — mirrored, or deferred to a named successor spec

## Alternatives Considered

- **Full provider portability** (S3-compatible abstraction over GCS, transcription off Cloud
  Run). Rejected in the originating conversation: costs real money and real runtime complexity
  to avoid a risk that a mirror covers for a few euros, and forfeits the $25K GCP credit.
- **Rely on Supabase's own backups.** Not evaluated. Worth a line in the investigation, but it
  does not answer the media buckets and puts recovery back inside a single vendor.
- **Accept the risk.** Defensible for the media buckets, whose loss is bounded. Not defensible
  for the dump, which is the artifact every other recovery depends on.

## Rollback Strategy

Delete the mirror step from `db-backup.yml` and revoke the credential. No data migration, no
schema change, nothing downstream reads the mirror. Rollback is a revert.

## Open Questions

1. Is there any *existing* second copy of prod data nobody has written down — a manual dump on
   a laptop, an old restore artifact? Not assessed this session.
2. Does `.private/docs/backup-recovery.md` already record a fallback that predates this spec?
   Referenced from `docs/decisions.md` 2026-02-25 [process], "macOS LaunchAgent PATH trap —
   Homebrew tools not in minimal PATH"; not read.

## Related

- `features/done/p991_backup_infra_sa_hardening.md` — writer SA scope, `.verified` markers
- `features/done/p997_prove_the_restore_end_to_end.md` — the restore is proven; reachability is not
- `features/done/2026-06-10/p995_backup_staleness_alert_routing.md` — alert routing precedent
- `features/p999_prompt_manual_backup_dispatch_after_pipeline_change.md` — open, same pipeline
- `features/p1148_credential_rotation_system.md` — where the new credential must land
- `docs/technical/db-restore.md` · `.github/workflows/db-backup.yml`
