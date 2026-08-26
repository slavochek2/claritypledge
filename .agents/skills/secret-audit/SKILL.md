---
name: secret-audit
description: Full git-history credential-leak audit — runs audit-secrets-history.sh, classifies each finding dead/live/public-by-design, allowlists only verified-safe ones, logs specifics to a gitignored private ledger. Standalone + /weekly sub-step.
when_to_use: "When checking whether a secret/credential leaked into git history (ad-hoc — e.g. 'did X leak?', after a near-miss, before open-sourcing), or as the /weekly secret-scan sub-step. NOT for PII-in-content (use /slava:maintain:privacy) and NOT for SAST code review of a diff (use the built-in /security-review)."
version: 1.0.0
---

# /secret-audit

Audit the full git history for leaked credentials, classify each finding, silence only the verified-safe ones, and log the specifics privately. This repo is **public** — assume anything ever pushed is compromised.

**Announce at start:** "Running /secret-audit."

This skill **classifies and allowlists; it does not rotate.** Rotation is an external action — it always stops and asks. It never declares a real credential dead on its own.

---

## When to use this vs other skills

| Situation | Skill |
|---|---|
| Did a credential/secret leak into git history? | `/secret-audit` ← here |
| Is there PII / private business detail in a public doc? | `/slava:maintain:privacy` |
| Review a code diff for injection/auth/SAST bugs | built-in `/security-review` |
| Capture a security learning | `.private/docs/security-incidents.md` (this skill writes it) |

---

## Output discipline (applies to every phase)

**Never print a full secret value** — anywhere, ever. Compare and display only fingerprints: `first2…last2(length)`. A terminal the human pastes elsewhere, or a committed file, must never carry a live secret.

---

## Workflow

### Phase 0 — Scope

State the git root (`git rev-parse --show-toplevel`) and which env files are present (`.env.local`, `.env.prod`, `.env.test.local`). The dead/live comparison reads these. If any is missing, say so — their absence weakens the comparison (see Phase 2).

---

### Phase 1 — Run BOTH scans (no early exit)

gitleaks is not exhaustive. This session it missed `.env.local.rtf` (an RTF-wrapped env file) — so a "no leaks found" from gitleaks alone is **not** a clean bill of health.

**1a. gitleaks history scan:**
```bash
bash scripts/audit-secrets-history.sh   # writes /tmp/cp-gitleaks-history.json
```

**1b. Literal scan for what gitleaks structurally misses** (always run, even if 1a is clean):
```bash
# Non-plaintext / encoded files ever ADDED to history (gitleaks under-scans these)
git log --all --full-history --diff-filter=A --name-only --pretty=format: \
  -- '*.rtf' '*.pdf' '*.docx' '*.b64' '*.bak' '*.env*' 2>/dev/null | sort -u | grep -v '^$'
# Any .env* blob ever committed (the .env.local.rtf class)
git rev-list --all --objects 2>/dev/null | grep -iE '\.env' | grep -viE 'environment|\.env\.example'
```

**Do not short-circuit.** Even when both scans are clean, continue to Phase 5 (verify defenses) before declaring a verdict. Report Phase 1 as: "gitleaks: N findings; literal scan: [files flagged / none]."

---

### Phase 2 — Classify each finding (dead / live / public-by-design)

For each gitleaks finding AND each literal-scan hit, extract the leaked value **at the flagged commit** and compare its fingerprint against the current env value. Build a table: `finding | file@commit | leaked fp | current fp | verdict`.

**PUBLIC-BY-DESIGN** — no action. ONLY these, and only after an explicit check:
- Supabase **anon** JWT — decode the payload and require an **exact** `"role":"anon"` match. Any decode failure, truncation, or a `service_role` role → treat as REAL+LIVE, never public. Log the decoded `role` field (only that field) in the table so Phase 3 can re-verify.
- Mixpanel project token, Web3Forms access key (client-bundle keys by design).

**REAL + DEAD** — candidate for allowlist, but **not auto-confirmed**:
- The leaked fragment differs from the current env value. This is *necessary but not sufficient* — the credential may still be live on a provider (Vercel env, Supabase vault, CI secret, a dashboard) even though the local env differs or lacks it. A local mismatch is **not** proof of death.

**REAL + LIVE** — leaked fragment == current env value. Live credential in public history.

JWT role decode helper (role field only, never the full token):
```bash
payload=$(printf '%s' "$JWT" | cut -d. -f2); pad=$(( (4-${#payload}%4)%4 ))
printf '%s%s' "$payload" "$(printf '=%.0s' $(seq 1 $pad))" | tr '_-' '/+' | base64 -d 2>/dev/null \
  | grep -oE '"role":"[^"]*"'
```

---

### Phase 3 — Adversarial re-check (sonnet subagent)

Spawn a `model: "sonnet"` critic. Pass the **classification table inline** (it is small, and inlining removes any chance of mis-location — subagents *can* read from disk, so this is a size choice, not a capability limit). Prompt:

```
You are a red-team reviewer. Here is a secret-audit classification table: [paste table].
Rules: a finding is GUILTY (live) until proven safe. For each row, the verdict is only
valid if BOTH are shown: (a) a fragment comparison leaked-vs-current, and (b) for
public-by-design, an exact role/key-type match. Flag any row where:
- a REAL credential is marked DEAD on a local-env mismatch alone (provider may still accept it),
- a JWT is called anon without an exact role:anon decode,
- a verdict has no fragment evidence.
Return per-row: SAFE / NEEDS-HUMAN / LIVE. Default to NEEDS-HUMAN when unsure.
```

Any `LIVE` or `NEEDS-HUMAN` row blocks Phase 4 for that finding until resolved.

---

### Phase 4 — Resolve (per-secret, never per-commit blind)

**REAL + DEAD candidates → require human confirmation of provider-side death:**
> "I can't confirm this is dead from local env files alone. Does `<finding>` still exist or work in Vercel / Supabase vault / CI / any provider dashboard? If you confirm it's been rotated/revoked there, I'll allowlist it."

Only **public-by-design** and **human-confirmed-dead** findings may be allowlisted.

**Before adding a commit SHA to the allowlist — enumerate EVERY secret in that commit** (the allowlist suppresses the whole commit, so a live secret riding along in the same commit would be silenced):
```bash
git show <SHA> | gitleaks detect --no-banner --no-git --pipe 2>/dev/null   # full inventory for that commit
```
Verify each string in the inventory is dead/public. If any cannot be verified → **do not allowlist the SHA**; resolve that secret first.

**Allowlist mechanism** — add the SHA to `commits` inside the existing `[allowlist]` block in `.gitleaks.toml` (show the diff first). **Never a gitleaks baseline file:** `--redact` only blanks the `Secret` field; the `Match` field still embeds dead password fragments, so a committed baseline re-publishes secrets and can trip the pre-commit scanner on itself (verified). Then re-run `bash scripts/audit-secrets-history.sh` → confirm "no leaks found".

**REAL + LIVE → STOP. Do not allowlist.** Present rotation steps and ask the human to rotate. Note plainly: gitignore, file deletion, and history rewrite do **not** un-leak a value already pushed to a public remote — rotation is the only fix.

---

### Phase 5 — Verify forward defenses actually fire (falsify, don't assume)

```bash
which gitleaks || echo "⚠️ gitleaks NOT installed — pre-commit secret scan is SILENTLY SKIPPED"
ls .github/workflows/secret-scan.yml && grep -nE 'on:|push|pull_request|fetch-depth' .github/workflows/secret-scan.yml
ls -la .git/hooks/ | grep -E 'pre-commit|pre-push|commit-msg'
```
A scanner you haven't confirmed fires is not a safety net. Report each: present / MISSING.

---

### Phase 6 — Log

**Specifics → `.private/docs/security-incidents.md`** (gitignored, append-only). Add a dated entry: trigger, per-finding table (credential type, commit SHA, leaked/current fragments, verdict, rotation/allowlist status). This is attacker-useful recon — it never enters the public repo.

**Public `docs/decisions.md` → only if a novel, zero-specifics, transferable principle emerged.** Most runs add nothing public — they just append to the private ledger. A public log of "what leaked / what the scanner now ignores" is recon; keep it private.

---

### Phase 7 — Self-check before returning control

- [ ] BOTH scans run (gitleaks + literal non-plaintext/`.env*` scan); no early-exit
- [ ] Every finding classified with a fragment comparison (not asserted from memory)
- [ ] Every anon-key call backed by an exact `role:anon` decode; decode-failure → LIVE
- [ ] Phase 3 critic ran on the table; no unresolved LIVE/NEEDS-HUMAN before any allowlist
- [ ] No REAL credential auto-marked DEAD on local-env mismatch alone — human confirmed provider-side
- [ ] Before each SHA allowlist: full per-commit secret inventory verified
- [ ] Any LIVE finding escalated for rotation, NOT allowlisted
- [ ] Forward defenses checked (gitleaks installed / CI / hooks) and reported
- [ ] No full secret value printed or written anywhere — fingerprints only
- [ ] Private ledger appended; public decisions.md touched only for a novel zero-specifics principle

---

## Output template (terminal)

```
SECRET AUDIT — YYYY-MM-DD
Scans:     gitleaks N findings · literal scan: [files / none]
Classified: X dead(confirmed) · Y public-by-design · Z LIVE · W needs-human
[finding | file@commit | leaked fp | current fp | verdict]
Allowlisted: <commit SHAs> (per-commit inventory verified)
LIVE → rotation requested: <list or none>
Defenses:  gitleaks ✓/✗ · CI secret-scan ✓/✗ · hooks ✓/✗
Ledger:    .private/docs/security-incidents.md updated
VERDICT:   clean | LIVE-secrets-need-rotation | review-needed (manual scan hits)
```

---

## Quality Gates (Agent Self-Review)

- [ ] Did NOT trust gitleaks "no leaks found" as a clean verdict — ran the literal scan too
- [ ] Did NOT allowlist a whole commit without enumerating every secret in it
- [ ] Did NOT mark a real credential dead without human provider-side confirmation
- [ ] Did NOT allowlist any LIVE finding to silence it
- [ ] Did NOT print or commit a full secret value
- [ ] Did NOT write incident specifics to a public file

---

## Known limits

- Scans git **history and tracked content** — not provider dashboards, Vercel/CI env, or runtime config. Provider-side liveness always needs human confirmation (that's why Phase 4 gates DEAD on it).
- gitleaks misses non-plaintext/encoded secrets — Phase 1b is the backstop, but a novel encoding could still slip through. When in doubt, escalate to the human.

---

## Related Skills

- `/slava:maintain:privacy` — PII / sensitive-content scan for public files (judgment layer over the pre-commit hook). Complementary, not security.
- built-in `/security-review` — SAST-style review of a code diff. Different job; don't confuse the two.
- `/slava:maintain:weekly` — invokes this skill's history scan as a background sub-step (§2.10.1).
- `.claude/rules/db-access.md` — credential/env tiering referenced during classification.
