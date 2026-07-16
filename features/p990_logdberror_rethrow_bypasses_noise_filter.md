---
status: in-progress
type: bug
rank: 1000945.0
severity: low
workstream: observability
date_reported: '2026-07-15'
created_date: '2026-07-15'
tags: [sentry, observability, noise-filter, error-handling]
delivery_stage: fix
pipeline_ran: [create-bug, architect, reproduce, fix]
reproduce_artifact:
  test_file: src/tests/p990-reproduce.test.ts
  root_cause: "letters-service.ts:385-386 (and 28 other sites): logDbError() suppresses the network blip (door 1), but the same call site immediately re-throws a plain Error wrapping the identical blip text, which Sentry's global handler reports unfiltered (door 2) — dropServiceWorkerRegistrationNoise, the only beforeSend wired today, only matches SW-registration stack frames."
  confidence: high
  surfaces_in_scope: [letters-service, docs-service, points-service-real, events-service-real]
  surfaces_deferred: []
  reproduced_at: '2026-07-16'
---

# P990: `logDbError` suppresses network-blip noise, then the next line re-throws it into Sentry

## Summary

`logDbError()` deliberately drops network-blip errors (`Load failed`, `Failed to fetch`, empty-message aborts) so they never reach Sentry — but 28 call sites immediately re-throw the same error wrapped in a new `Error`, which reaches Sentry through the global handler instead. The filter suppresses one door and the throw opens another.

Prior art: **P913** added the expired-token filter and the `Load failed` / empty-message filters were added to `db-error-logger.ts` (see its inline comments citing `JAVASCRIPT-REACT-2H`, `-2J`). Those filters work — for the non-throwing paths. What they missed: every `logDbError(...)` followed by `throw new Error(...)` re-reports the identical noise under a different message.

## Root Cause

`src/app/data/db-error-logger.ts:36-50` returns early (no `Sentry.captureException`) when the Postgrest-shaped error is a network blip. But the pattern at the call sites is:

```typescript
if (error) {
  logDbError('submitPointResponse', error);                        // filtered → no Sentry
  throw new Error(`Failed to submit point response: ${error.message}`);  // ← unfiltered → Sentry
}
```

The thrown `Error` carries the blip text in its message (`Failed to submit point response: TypeError: Load failed`) and is a plain `Error`, not a `PostgrestError`, so `logDbError`'s filter never sees it. It propagates to Sentry's global handler / the React ErrorBoundary.

**Evidence this is live, not theoretical:** Sentry has both twins for the same underlying event —
- `JAVASCRIPT-REACT-28` — `DB error in submitPointResponse: TypeError: Load failed` (the `logDbError` path; **now filtered**)
- `JAVASCRIPT-REACT-29` — `Failed to submit point response: TypeError: Load failed` (the `throw` path; **still reported**)

Both fired from `/letter/7bd0d109-…`, one event each, same timeframe. 28 is silenced; 29 is not.

## Reproduction Steps

1. Open `/letter/:id` as a recipient on a flaky connection (or Mobile Safari, which phrases a failed fetch as `Load failed`).
2. Submit a point response.
3. Kill connectivity mid-request (or background the tab so Safari kills the fetch).
4. Observe: `logDbError('submitPointResponse', …)` correctly suppresses, but Sentry still receives `Failed to submit point response: TypeError: Load failed`.

**Reproduction rate:** intermittent — requires the fetch to fail; 1 event observed in ~1 month.

## Reproduction (confirmed 2026-07-16)

Sentry is production-only (`main.tsx:24`, `sentryDsn && import.meta.env.PROD`), so the real Mobile Safari → global handler → `beforeSend` path is not reproducible live in a dev session — same constraint the architect phase already flagged ("Verified by proxy, not directly observed"). Reproduced at the logic level instead, against the actual shipped code (no mocks of app logic, only the Sentry SDK boundary):

1. Confirmed the current source still matches the spec's analysis exactly: `db-error-logger.ts:36-43` (message-substring blip check, ungated on `error.code`), `sentry-filters.ts` (only `dropServiceWorkerRegistrationNoise` exists — no blip-aware filter), `main.tsx:39` (`beforeSend: dropServiceWorkerRegistrationNoise`), and `letters-service.ts:385-386` (`logDbError(...)` immediately followed by `throw new Error(...)`) — all read fresh this session.
2. Wrote `src/tests/p990-reproduce.test.ts` with two assertions:
   - **Door 1** — `logDbError('submitPointResponse', <blip>)` does not call `Sentry.captureException`. **Passes** — confirms the existing filter works as designed.
   - **Door 2** — a Sentry event modeled on the call site's rethrow (`Failed to submit point response: TypeError: Load failed`, app-frame stacktrace, not an SW-registration frame) is run through today's only `beforeSend` (`dropServiceWorkerRegistrationNoise`). Expected/correct behavior: dropped (`null`). **Fails today** — the filter returns the event unchanged, because it only recognizes SW-registration stack frames, not rethrown blips.

**Evidence:** door 1 green, door 2 red, both from the shipped code — reproduces the exact "28 filtered / 29 reported" split observed in prod Sentry.

## Expected Behavior

A network blip produces no Sentry event at all, regardless of whether the call site re-throws. The user-facing error path (toast, retry affordance) is unaffected — the throw should still happen, it just shouldn't be *reported* as an application bug.

## Actual Behavior

The blip is reported to Sentry under the wrapper message. `JAVASCRIPT-REACT-29` is the live instance.

## Affected Files

- `src/app/data/db-error-logger.ts` — lines 36-50, the `isNetworkBlip` predicate (currently local, not exported)
- 28 call sites of the `logDbError(...)` → `throw new Error(...)` shape:
  - `src/app/data/letters-service.ts` — 17 sites (78, 337, 386, 485, 506, 670, 849, 871, 886, 927, 1131, 1168, 1677, 1693, …)
  - `src/app/data/docs-service.ts` — 9 sites (272, 496, 538, 556, 578, 599, 621, 638, 651)
  - `src/app/data/points-service-real.ts` — 2 sites (865, 880)
  - `src/app/data/events-service-real.ts` — 3 sites (891, 923, 938)

## Severity

**Low** — 0 users impacted, 1 observed event. The user-facing behavior is already correct (the throw drives the error UI); this is reporting hygiene only. Filed because it's a systemic hole in a filter the team already decided it wanted: leaving it means the `Load failed` noise the P913-era work suppressed keeps arriving under different names.

## Fix Approach

Do **not** hand-edit 28 call sites. The blip classification already exists — the fix is to make the throw path consult it.

**A broad `beforeSend` message filter is disfavoured — this is settled, not open.** decisions.md 2026-06-05 (P883) explicitly rejected Sentry-side filtering for noise our own code already classifies: *"the filter belongs where the knowledge lives, and a Sentry filter would also hide genuinely unexpected errors sharing the message shape."* A `/Load failed/` message filter would drop a genuinely unexpected error that happens to wrap a fetch failure — exactly the harm P883 named. (P988's `ignoreErrors` patterns are **not** a precedent here: that noise is injected by the host browser and our code never sees it, so Sentry-side is the only available layer. See the four-rung ladder in decisions.md 2026-07-15.)

Preferred direction (needs a design call at `/architect` time):
- Keep the knowledge where it lives. Export the `isNetworkBlip` predicate from `db-error-logger.ts` and classify at the service layer, per P883's ordering rule.
- Have the blip path throw a **distinguishable error type** (e.g. a `NetworkBlipError`) rather than a bare `Error`, so any Sentry-side drop keys on the type *our code assigned* rather than on a message shape Sentry has to guess at. This preserves the user-facing throw while making the report suppressible without message breadth.
- The 28-call-site churn is the real cost of this route and the reason the broad filter was tempting. Look for a shared choke point (a `throwDbError(context, error)` helper the sites already funnel through, or could) so the classification is written once, not 28 times — a future site that forgets the helper is the failure mode to design against.

## Acceptance Criteria

- [ ] A Sentry event with message `Failed to submit point response: TypeError: Load failed` is dropped
- [ ] A Sentry event with message `Failed to create letter: TypeError: Load failed` is dropped (proves the fix is generic, not one call site)
- [ ] A genuine application error from the same functions (e.g. `Failed to create letter: duplicate key value violates unique constraint`) still reaches Sentry
- [ ] A genuine application error whose message *contains* blip text still reaches Sentry — this is the P883-harm case, and it is what proves the drop is keyed on the type our code assigned rather than on a message shape. Two sub-cases: a plain `Error` reading `... TypeError: Load failed`, and a `PostgrestError` with `code: '22P02'` / `invalid input syntax for type uuid: "Load failed"`. **The second fails against today's code** — the predicate's message branch is not code-gated (see Security Review → Input Validation)
- [ ] A real network blip (`code: ''`, message `TypeError: Load failed`) is still classified and dropped — proves the code gate closed the misclassification without narrowing blip coverage
- [ ] Suppression is observable — both suppression paths emit a `db-error-suppressed` breadcrumb, and neither emits a Sentry issue
- [ ] The user-facing error path is unchanged — the throw still happens and the UI still shows its error state
- [ ] Regression test passes: `src/tests/p990-*.test.ts`
- [ ] No console errors during the affected flow

## Technical Architecture

### Technical Analysis

#### Real call-site count: **29, not 28** (AST-verified)

The spec's headline (28) and its per-file breakdown (17 + 9 + 2 + 3 = 31) are both wrong, and they disagree with each other. Ground truth, obtained by running an `@typescript-eslint/parser` AST selector (`ExpressionStatement[expression.callee.name="logDbError"] + ThrowStatement`) across `src/`:

| File | `logDbError` calls | **followed by `throw`** |
|---|---|---|
| `src/app/data/letters-service.ts` | 62 | **15** |
| `src/app/data/docs-service.ts` | 14 | **9** |
| `src/app/data/events-service-real.ts` | 20 | **3** |
| `src/app/data/points-service-real.ts` | 14 | **2** |
| `agreements` / `badge` / `calibration` / `stories` -service-real | 36 | **0** |
| **Total in `src/`** | **156** | **29** |

**127 call sites do NOT throw** (they `return null` / `return 0` / `return []` and degrade gracefully). Their behavior must not change — they are already correctly suppressed by rung 2 and are out of scope.

**Why the spec said 28.** A line-oriented scan finds only 28 — it misses `letters-service.ts:1725`, where a 9-line `[P904 v0 ACCEPTED]` comment block sits between `logDbError('uploadExplainBack.insert', error)` and its `throw`. The AST selector ignores comments and finds it. **This is load-bearing for Decision 2:** a grep/regex-based enforcement gate provably misses a site that exists in the tree today. Only an AST-aware check is sound here.

#### Layer-ladder rung (decisions.md 2026-07-15)

The ladder asks **"does our code ever see this error?"**:

> 1. **Our code sees it AND can branch expected/unexpected** → classify first, `logDbError` on the unexpected path only (P883).
> 2. **Our code sees it, whole class expected** → suppress at the `logDbError` choke point (P913).
> 3. **Our code sees it, but the signature lives in frames not the message** → frame-based `beforeSend` in `src/lib/sentry-filters.ts` (P882).
> 4. **Our code NEVER sees it — injected by the host browser** → `ignoreErrors` message patterns (P988).

**P990 lands on rung 1.** Our code holds the `PostgrestError` and can already branch on it (`isNetworkBlip`). It is *not* rung 3 (the signature is in the message, not the frames) and *not* rung 4 (we throw the error ourselves).

The subtlety: rung 1's prescribed remedy — "`logDbError` on the unexpected path only" — is **already satisfied**, and the leak persists anyway. Rung 1 was written from P883, whose call site did not re-throw. P990's shape is rung-1 classification plus a mandatory user-facing `throw` that an un-suppressible global handler then catches. So the classification stays at rung 1; what's missing is a *transport* for a verdict rung 1 never had to transmit across the throw boundary.

This is exactly the direction decisions.md 2026-07-15 already pre-endorsed: *"classify at the service layer and throw a distinguishable error type, so any Sentry-side drop keys on the type our code assigned rather than on a message shape it has to guess at."* The `beforeSend` in Decision 3 is **not** the rejected message-shape filter: Sentry does no guessing: it reads a boolean our code already decided. The knowledge stays where it lives.

#### A message filter is not merely disfavoured — it is incapable here

Beyond the settled P883 objection, **5 of the 29 sites throw static messages that never interpolate `error.message`**:

- `docs-service.ts:620` → `throw new Error('Failed to check letter status')`
- `docs-service.ts:637` → `throw new Error('Failed to clean up draft letters')`
- `letters-service.ts:1676` → `throw new Error('Could not start the upload. Please try again.')`
- `letters-service.ts:1692` → `throw new Error('Upload failed. Please try again.')`
- `letters-service.ts:1725` → `throw new Error('Could not save your explanation. Please try again.')`

A `/Load failed/` `beforeSend` cannot drop these — the blip text is absent from the thrown message. Type-keying covers all 29 uniformly; message-keying covers at most 24. This independently falsifies the message-filter route on capability grounds, not just on P883 principle.

#### Reuse inventory

| Existing thing | Location | Verdict |
|---|---|---|
| `isNetworkBlip` predicate | `db-error-logger.ts:36-43` (**spec says 36-50 — stale**) | **Reuse**, extracted. Local `const`, not exported, computed inline. |
| Empty-message blip check | `db-error-logger.ts:45-50` | **Reuse** — a *second*, distinct blip shape (`!msg && !error.code`, Mobile Safari killed background fetch, `JAVASCRIPT-REACT-2J`). The spec treats the blip class as one predicate; it is two. Both must be covered or `-2J` leaks through the same door. |
| Expired-token filter (P913) | `db-error-logger.ts:62-65` | **Untouched** — not a blip; its sites don't throw. |
| `dropServiceWorkerRegistrationNoise` (P882) | `src/lib/sentry-filters.ts:78-96` | **Reuse, compose.** Signature is `(event)` only — no `hint`. Sentry allows exactly one `beforeSend`, so it must be composed, not replaced. |
| `IGNORED_ERROR_PATTERNS` / `isIgnoredMessage` (P988) | `src/lib/sentry-filters.ts:23-67` | **Untouched.** |
| `Sentry.init` | `src/main.tsx:25-57`; `beforeSend: dropServiceWorkerRegistrationNoise` at `:39` | **Modify** — point at the composed callback. |
| Custom `Error` subclasses | `grep -rn "extends Error" src/` → **zero hits** | **New** — inventory shows no existing subclass and no error-wrapping helper (`grep` for `throwDbError`/`wrapError` → zero hits). |
| Extract-predicate-for-testability precedent | decisions.md 2026-07-15: *"Extract the predicate when config isn't testable"* | **Follow** — `main.tsx` is a side-effectful entry point, unimportable from tests. |

#### Dependencies (verified)

- `@sentry/react` **10.27.0** (`package.json:41` `^10.27.0`; `node_modules/@sentry/react/package.json` and `@sentry/core` both resolve to **10.27.0**).
- TS `target: ES2020` (`tsconfig.app.json:4`). **This matters:** an ES5 downlevel target breaks `instanceof` on `Error` subclasses (the classic `setPrototypeOf` footgun). At ES2020 native classes are emitted and `instanceof` is sound. No `setPrototypeOf` workaround needed.
- `PostgrestError` is a **class** `extends Error` with required `details`/`hint`/`code` (`node_modules/@supabase/postgrest-js/dist/cjs/PostgrestError.d.ts`).
- **`tsc` is not a usable gate on this repo:** `npx tsc -p tsconfig.app.json --noEmit` reports **868 pre-existing errors**, including `letters-service.ts(1692,43): TS2345: Argument of type 'Error' is not assignable to parameter of type 'PostgrestError'` — i.e. two sites already pass a plain `Error` to `logDbError`, violating its declared signature. The helper must accept the union the sites actually pass. ESLint, by contrast, **is** already a blocking gate (`scripts/pre-commit-checks.sh:129`, `npx eslint $STAGED_TS --max-warnings 0`).

#### STEP 5 verification: does the thrown type survive to `beforeSend`? — **VERIFIED**

**Finding: yes.** `hint.originalException` holds the **live thrown object by reference**, un-serialized, on every capture path this app uses. `instanceof NetworkBlipError` in `beforeSend` is sound. Read this session in the installed package (ground truth, not memory, not docs):

1. **The signature carries a hint.** `node_modules/@sentry/core/build/types/types-hoist/options.d.ts:414`:
   ```ts
   beforeSend?: (event: ErrorEvent, hint: EventHint) => PromiseLike<ErrorEvent | null> | ErrorEvent | null;
   ```
2. **The hint field exists and is untyped-passthrough.** `node_modules/@sentry/core/build/types/types-hoist/event.d.ts:77-86`:
   ```ts
   export interface EventHint { …; originalException?: unknown; … }
   ```
3. **The hint actually reaches the callback** (runtime, not just types) — `node_modules/@sentry/core/build/cjs/client.js:983-994`, `processBeforeSend`:
   ```js
   if (isErrorEvent(processedEvent) && beforeSend) { return beforeSend(processedEvent, hint); }
   ```
4. **Capture path A — global handlers** (`onerror` / `onunhandledrejection`, how an unhandled async service rejection reaches Sentry). `node_modules/@sentry/browser/build/npm/cjs/prod/integrations/globalhandlers.js:56-62` and `:82-88`:
   ```js
   core.captureEvent(event, { originalException: error, mechanism: { handled: false, type: 'auto.browser.global_handlers.onerror' } });
   ```
   `error` is the thrown object itself, passed by reference.
5. **Capture path B — `Sentry.ErrorBoundary`** (live in this app at `src/App.tsx:266`, wrapping the Router). `@sentry/react/build/esm/error.js` → `captureReactException` calls `captureException(error, hint)` with the original error; `node_modules/@sentry/core/build/cjs/scope.js:583-602` then sets:
   ```js
   this._client.captureException(exception, { originalException: exception, syntheticException, ...hint, event_id: eventId }, this);
   ```
   Object identity is preserved (React ≥17 sets `error.cause` via `setCause` but does not replace the error).

**Serialization does not erase the type** because `beforeSend` runs *before* envelope construction — `client.js` builds the envelope in `sendEvent` (`:465-476`), downstream of `processBeforeSend`. The `event.exception` payload is the flattened/serialized view; `hint.originalException` is the raw object. **Key the drop on the hint, never on the event.**

**Verified by proxy, not directly observed:** the end-to-end prod flow (real Mobile Safari blip → global handler → our `beforeSend`) is not reproducible in this session. The claim rests on reading the installed SDK's source + types, plus the unit tests in the Build Sequence. Sentry is production-only (`main.tsx:24`, `sentryDsn && import.meta.env.PROD`), so no local runtime confirmation is available at `/architect` time.

#### ESLint enforcement: selector VERIFIED to fire (epistemic gate 7)

Gate 7 forbids trusting an unfired gate. The selector was exercised against a synthetic fixture **and** the real tree before being proposed:

- **Violation shape** (`logDbError(...)` then `throw new Error(...)`) → flagged, **exit code 1**.
- **Non-throwing site** (`logDbError(...)` then `return 0`) → not flagged. Confirms the 127 graceful-degradation sites stay silent.
- **Fixed shape** (`throwDbError(...)`) → not flagged. Confirms the rule accepts the target state.
- **Against the real `src/app/data/**/*.ts`** → exactly **29 errors**, matching the AST census file-for-file (15 / 9 / 3 / 2), and correctly **not** matching `docs-service.ts:625` (`throw new Error('SEALED_LETTERS_EXIST')`, preceded by an `if`, not by `logDbError`). No over-match.

### Architecture Decisions

#### Decision 1 — Classification stays in our code; extract the blip predicate to `src/lib/network-blip.ts`

**Chosen:** A new module `src/lib/network-blip.ts` exporting (a) `isNetworkBlip(error): boolean` — a **pure, env-independent** predicate covering *both* blip shapes (message-substring match, and the `!message && !code` Mobile Safari shape), and (b) the `NetworkBlipError` class. `db-error-logger.ts` imports the predicate and drops its inline copy, so one definition serves the logger, the thrower, and the Sentry filter.

**Both branches are gated on `!error.code`** (Security Review, Input Validation). Today only the empty-message branch checks the code; the message-substring branch (`:36-43`) does not, so a genuine Postgres error whose message contains blip text — canonically `22P02` / `invalid input syntax for type uuid: "Load failed"` — is misclassified as a blip. That is a live bug in the current predicate, and this spec **widens** it: once `isNetworkBlip` also gates the throw path, a misclassified error is suppressed at both doors with no remaining path to Sentry. Gating on `!error.code` is verified safe against the installed `@supabase/postgrest-js` **2.84.0**, which builds client-side network errors with `code: ''` (`dist/cjs/PostgrestBuilder.js:197-203`) and documents the invariant at `:176-177`: *"We don't populate code/hint for client-side network errors since those fields are meant for upstream service errors (PostgREST/PostgreSQL)."* Blips carry no code; genuine Postgres errors always do. The gate closes the misclassification without narrowing blip coverage.

**Suppression is observable** (Security Review, Suppression Integrity). Both suppression sites — `logDbError`'s blip early-return and `throwDbError`'s blip branch — emit `Sentry.addBreadcrumb({ category: 'db-error-suppressed', level: 'info', data: { context, reason: 'network-blip' } })`. Two sites only, never the 156 call sites. A breadcrumb emits no Sentry issue; it attaches to a *later* captured error, so an over-suppression incident is discoverable in the breadcrumb trail without reintroducing the noise this spec removes. This is the residual mitigation for P883's named hazard ("would also hide genuinely unexpected errors"): the `!error.code` gate addresses the root, the breadcrumb makes a future mistake findable.

**Rationale:** (1) *User outcome / correctness* — the predicate becomes the single source of truth for "is this a blip." Reuse inventory shows the knowledge exists but is trapped as a local `const` at `db-error-logger.ts:36-43`, unusable by the throw path. Copying it would violate Reference Over Duplication and let the two copies diverge silently. (2) *Correctness* — covering both shapes closes `JAVASCRIPT-REACT-2J` (empty-message blip) through the same door; a predicate covering only the message-match shape would leave that twin leaking, re-creating P990 under a new number. (3) *Sustainability* — `logDbError` returns early in dev **before** the blip check (`db-error-logger.ts:27-30`), so blip classification is currently reachable only in prod. A pure predicate is directly unit-testable with no `import.meta.env` mocking, following the extract-for-testability precedent decisions.md set for `IGNORED_ERROR_PATTERNS`.

**Trade-off:** One more file in `src/lib/`, and `db-error-logger.ts` gains an import. The blip definition moves out of the file whose comments currently document it — mitigated by carrying the `JAVASCRIPT-REACT-2H` / `-2J` citations across verbatim.

**Alternative rejected:** *Export `isNetworkBlip` from `db-error-logger.ts` directly* (the spec's suggested shape). Rejected on runtime-dependency grounds: `sentry-filters.ts` needs `NetworkBlipError`, and `sentry-filters.ts` is imported by `main.tsx` **at Sentry-init time**. Importing from `app/data/db-error-logger` would drag the data layer (and its `@sentry/react` + `@supabase/postgrest-js` imports) into the Sentry bootstrap path, coupling error-reporting config to the data layer. A leaf module both sides import keeps the dependency arrows pointing one way. *Also rejected:* putting `NetworkBlipError` in `sentry-filters.ts` — it is a data-layer domain type, not a Sentry filter; the logger would then import "sentry-filters" to throw an error, which is a wrong-home dependency.

#### Decision 2 — One choke point (`throwDbError`), mechanically enforced by an ESLint AST rule

**Chosen:** Add `throwDbError(context, error, message): never` to `src/app/data/db-error-logger.ts`. It calls `logDbError(context, error)` (preserving today's rung-2 suppression on the direct door) and then throws `new NetworkBlipError(message)` when `isNetworkBlip(error)`, else `new Error(message)`. All 29 sites funnel through it. A `no-restricted-syntax` rule in `eslint.config.js` then makes the old shape a **lint error**:

```js
{
  selector: 'ExpressionStatement[expression.callee.name="logDbError"] + ThrowStatement',
  message: 'P990: logDbError followed by a bare throw re-reports filtered noise to Sentry. Use throwDbError(context, error, message) instead.',
}
```

Signature: `throwDbError(context: string, error: PostgrestError | Error | null | undefined, message: string): never`. The `error` param is **widened** beyond `logDbError`'s declared `PostgrestError` because two sites already pass a plain `Error` (`letters-service.ts:1676`, `:1692`) — one of which is a live `TS2345` in the 868-error baseline. `message` is passed **verbatim per site**, never reassembled, so every existing Sentry message string and issue grouping is preserved byte-for-byte. `: never` preserves the control-flow narrowing that the bare `throw` gives TS today (load-bearing at sites like `createLetter`, where `if (error || !data)` must narrow `data` afterwards).

**Rationale:** (1) *User outcome* — the spec names the real failure mode as "a future site that forgets the helper," and prose cannot catch that. ESLint is **already** a blocking pre-commit gate at `scripts/pre-commit-checks.sh:129` with `--max-warnings 0`, so this needs **zero new gate infrastructure** — it rides an enforcement channel that already fails the commit. (2) *Correctness* — the rule is AST-based, so it catches `letters-service.ts:1725` where a comment block separates the call from the throw. A grep-based check in `pre-commit-checks.sh` **provably misses that site today** (that is precisely how the spec's own count came out at 28). (3) *Sustainability* — this follows the repo's settled precedent that prose rules which get bypassed are mechanized rather than reworded (decisions.md 2026-07-15 [process], hook enforcement).

**Trade-off:** 29 call sites change in one commit — a wide diff across 4 files, each edit mechanical and individually reviewable. The rule is keyed on the *identifier* `logDbError`, so it would not catch an alias (`const l = logDbError`); accepted — no alias exists and the rule's message names the correct helper.

**Alternative rejected:** *Make `logDbError` itself throw.* Rejected on correctness: 127 of the 156 call sites deliberately do **not** throw — they return `0` / `[]` / `null` and degrade gracefully (this is the exact behavior P913 relied on for `getUnreadLetterCount`). Making the logger throw would convert 127 graceful degradations into unhandled exceptions — a severe user-facing regression to fix a reporting-hygiene bug. *Also rejected:* a grep-based gate in `scripts/pre-commit-checks.sh` (misses the comment-separated site — falsified above, not hypothesized). *Also rejected:* hand-editing sites with no enforcement — decisions.md already lists this under "Alternatives rejected: hand-editing 28 call sites (misses every future site)."

#### Decision 3 — Drop via `beforeSend` keyed on `hint.originalException instanceof NetworkBlipError`

**Chosen:** Add `dropNetworkBlipRethrow(event, hint)` to `src/lib/sentry-filters.ts`, returning `null` when `hint?.originalException instanceof NetworkBlipError`. Because Sentry accepts exactly one `beforeSend` and `dropServiceWorkerRegistrationNoise` (P882) already occupies the slot, export a composed `sentryBeforeSend(event, hint)` that runs the SW filter first, then the blip filter, and point `main.tsx:39` at it. `dropServiceWorkerRegistrationNoise` keeps its current `(event)` signature so `src/tests/p882-sentry-sw-filter.test.ts` continues to pass unmodified.

**Rationale:** (1) *Correctness* — rests on the STEP 5 VERIFIED finding: `hint.originalException` is the raw thrown object on both capture paths this app uses (global handlers and `Sentry.ErrorBoundary`), and `beforeSend` runs before envelope serialization. (2) *Correctness again, and this is the crux* — keying on a **type our code assigned** is categorically different from keying on a message shape Sentry must guess at. The P883 harm ("a Sentry filter would also hide genuinely unexpected errors sharing the message shape") **cannot occur**: a genuine error carrying `Load failed` in its text is not a `NetworkBlipError` and is not dropped. This is directly testable and is an explicit Build Sequence step. (3) *Capability* — covers all 29 sites including the 5 static-message throws a message filter cannot reach.

**Trade-off:** The `beforeSend` filter is now coupled to a data-layer type. If `NetworkBlipError` is ever thrown by code that *should* report, the filter silently drops it — bounded by the class having exactly one construction site (`throwDbError`), which the ESLint rule keeps as the only door.

**Alternative rejected:** *Don't throw at all on the blip path.* Rejected on the spec's settled constraint ("The user-facing throw MUST still happen — this is reporting hygiene only, not a UX change") and independently on blast radius: suppressing the throw would silently convert the error path to a success path at all 29 sites, requiring every downstream caller's error UI to be re-verified. The blast radius is real — e.g. `submitPointResponse` is awaited at `src/app/hooks/useLetterReadingState.ts:542` inside the reading flow, where swallowing the rejection would let the UI advance the story phase (`updateCurrentStory`, `:548`) as if the response had persisted, showing the receiver a recorded position that was never written. That is a data-integrity-visible regression traded for a logging fix. Not proposed; not pursued further. *Also rejected:* a broad `/Load failed/` message `beforeSend` — settled by decisions.md 2026-06-05 (P883) and reaffirmed 2026-07-15; additionally falsified on capability above.

#### Decision 4 — The blip path keeps identical user-facing behavior (proven, not asserted)

**Chosen:** `NetworkBlipError extends Error`, carrying the **verbatim per-site message**. The throw still happens at the same point, with the same message, and propagates identically.

**Rationale / proof.** The change is `throw new Error(m)` → `throw new NetworkBlipError(m)`. Three ways a caller could observe that, each checked this session:

1. **`instanceof Error`** — 29 occurrences across `src/`. A subclass **passes** all of them (`NetworkBlipError` *is* an `Error`). Unchanged.
2. **Exact-constructor identity** (`e.constructor === Error`) — the only pattern a subclass would break. `grep -rn "constructor === Error\|constructor\.name === 'Error'\|\.constructor ===" src/` → **zero hits**. Nothing branches this way.
3. **Message matching** — 3 catch sites match on `err.message` (`drafts-tab.tsx:82` `SEALED_LETTERS_EXIST`; `sent-tab.tsx:216` `DELIVERIES_EXIST`; `useLetterReadingState.ts:591` `Invalid or expired token`). All three read `err.message`, which `throwDbError` preserves byte-for-byte. Moreover **none of the three is among the 29** — each is thrown by a bare `throw` not preceded by `logDbError` (e.g. `docs-service.ts:625`), confirmed by the selector not matching them.

Since `.message`, `.stack`, `instanceof Error`, and the throw site are all unchanged, and nothing branches on exact constructor identity, no caller can distinguish the two. `tsc` narrowing is preserved by the `: never` return type. **AC #4 is discharged by this check plus the Build Sequence step 8 UI assertion.**

**Trade-off:** None identified for the blip path. The residual is Decision 3's: `NetworkBlipError` must only ever be thrown for genuine blips.

**Alternative rejected:** *A `cause`-chained plain `Error` (`new Error(m, { cause: blip })`) keyed by `beforeSend` walking `.cause`.* Rejected on correctness: `@sentry/react`'s `captureReactException` **mutates `error.cause`** on the ErrorBoundary path (`setCause`, `@sentry/react/build/esm/error.js`), and the `LinkedErrors` integration also consumes `cause`. Keying our drop on a field the SDK writes to makes the filter depend on SDK-internal behavior. A dedicated class is inert and owned by us.

### Security Review

**RLS Policies:**
- ✅ No RLS, table, or policy changes. `db-error-logger.ts` only reads `PostgrestError` objects returned by existing queries and calls `Sentry.captureException` — it issues no queries itself. Confirmed by full read of the file and 3 sampled call sites.

**Authentication:**
- ✅ No caller gains or loses access to any code path. The classification change is Sentry-reporting-only; the thrown error's message is byte-identical (Decision 4), so an unauthenticated caller learns nothing new from the response.

**Input Validation — the predicate reads attacker-influenceable text:**
- ⚠️ **The message-substring branch is not code-gated, and this fix widens the blast radius of that gap.** `db-error-logger.ts:36-43` matches `msg.includes('Load failed')` (and 5 sibling patterns) with **no `!error.code` requirement** — only the empty-message branch at `:50` checks the code. This contradicts the file's own comment at `:47-49`: *"A genuine Postgrest error always carries a Postgres error code."* The reasoning is stated but applied to only one of the two branches. **Consequence:** any genuine Postgres error whose message happens to contain blip text is misclassified as a blip. The concrete shape is `22P02` — `invalid input syntax for type uuid: "Load failed"` — which echoes the offending value verbatim into `.message` and carries a real code.

  **Why P990 makes it worse:** today the misclassification suppresses only the `logDbError` door. After this fix, `isNetworkBlip` also decides whether `throwDbError` throws a `NetworkBlipError`, which `beforeSend` drops — so a misclassified genuine error would be suppressed on **both** doors, with no remaining path to Sentry.

  **Required handling:** the extracted predicate in `src/lib/network-blip.ts` (Decision 1) must gate the message-substring branch on `!error.code`, mirroring the existing empty-message branch. **Verified safe this session** — `node_modules/@supabase/postgrest-js/dist/cjs/PostgrestBuilder.js:197-203` (v2.84.0) constructs client-side network errors with `code: ''`, and its comment at `:176-177` states the invariant explicitly: *"We don't populate code/hint for client-side network errors since those fields are meant for upstream service errors (PostgREST/PostgreSQL)."* So `!error.code` separates blips (code `''`) from genuine Postgres errors (code `22P02`/`23505`) without narrowing legitimate blip coverage. This is upstream's documented contract, not an inference.

- ✅ **Exploitability: lower than it first appears — the security pass overstated this.** The reviewing agent proposed a crafted-link attack (`/letter/Load failed` → `22P02` → silent drop). That specific path is **blocked**: `src/App.tsx:143` gates `/letter/:id` with `UUID_RE` and routes non-UUIDs to slug resolution instead, so nothing reaches `get_letter_by_token` with a raw non-UUID. And a direct PostgREST call with the anon key never executes our JS, so there is no Sentry event to suppress — the "oracle" achieves nothing there. **The fix is required on correctness grounds, not attack-path grounds:** a `22P02` is a real DB error and must reach Sentry by the file's own stated logic. *Unverified:* other entry points passing user-controlled strings to UUID-typed params were not exhaustively audited — the `UUID_RE` guard was confirmed for `/letter/:id` only.

**Data Protection:**
- ✅ **No new PII exposure.** `logDbError:67-74` already sends `extra: { context, code, details, hint }` for every non-filtered error, and `error.details` on a unique violation can carry the conflicting value (Postgres's `DETAIL: Key (…)=(…) already exists.` convention). This is **pre-existing and untouched** — P990 changes only the throw path. The wrapper messages reaching Sentry carry the same `error.message` `logDbError` already saw. For the unique-constraint shapes sampled (`profiles_slug_key`, `idx_letter_deliveries_unique_email`, `unique_admin`), Postgrest's `.message` holds only the constraint name, not the value. *Unverified for constraint types not sampled* — this is a message-shape observation, not a guarantee. No action required in this spec; flagged as the surface to scope if a future spec touches `logDbError`'s `extra` block.

**Suppression Integrity:**
- ⚠️ **A type-keyed drop inherits P883's hazard if the type is assigned by a loose predicate.** decisions.md 2026-06-05 rejected message-shape filtering partly because it "would also hide genuinely unexpected errors sharing the message shape." Assigning the type from that same loose match moves the hazard one layer earlier rather than removing it. The `!error.code` tightening above addresses the root. **Required handling (defense-in-depth):** add `Sentry.addBreadcrumb({ category: 'db-error-suppressed', level: 'info', data: { context, reason: 'network-blip' } })` at the **two** suppression sites only — `logDbError`'s blip early-return and `throwDbError`'s blip branch — **not** at all 156 call sites. Breadcrumbs emit no Sentry issue; they attach to a *later* captured error, so a wrong-classification incident becomes discoverable without reintroducing the noise this spec exists to remove. This answers the spec's original open question about observable suppression.

**AI Prompt Security:**
- N/A — `grep -rln "anthropic|openai|claude" src/app/data/` returned no matches. No LLM/AI prompt path touched.

### Implementation Approach

**Worktree recommended:** touches build config (`eslint.config.js`) plus the Sentry bootstrap (`main.tsx`) and 29 call sites across 10 created+modified files — above the 10-file threshold, and a mid-flight `eslint.config.js` change would surface as lint failures in any co-tenant session sharing the main checkout.

#### Build Sequence

1. **Create `src/lib/network-blip.ts`** — `NetworkBlipError extends Error` (set `this.name = 'NetworkBlipError'`) and the pure `isNetworkBlip(error)` predicate covering **both** blip shapes, **extracted verbatim** (message-branch NOT yet code-gated — that is step 2b). Carry the `JAVASCRIPT-REACT-2H` / `-2J` comment citations across from `db-error-logger.ts`.
2. **(2a) Refactor `db-error-logger.ts` to import the predicate** — delete the inline `const isNetworkBlip` (`:36-43`) and the `!msg && !error.code` check (`:50`), replacing both with the imported call. **Behavior-neutral step:** run `src/tests/db-error-logger.test.ts` + `src/tests/p913-unread-count-anon-no-sentry.test.ts` and confirm green *before* proceeding. This isolates "extraction broke something" from "the new feature broke something."
   **(2b) Then tighten the message branch to require `!error.code`** (Security Review, Input Validation) — a **separate commit from 2a**, because it is deliberately **not** behavior-neutral: a `22P02`-class error whose message contains blip text starts reporting to Sentry where it was previously dropped. That is the intended correction. Splitting 2a/2b preserves step 2a's own logic — a test that goes red here means the tightening changed behavior, not that the extraction broke. Write the `22P02` test (step 8) alongside this, not after.
3. **Add `throwDbError(context, error, message): never`** to `db-error-logger.ts`. Emit the `db-error-suppressed` breadcrumb on its blip branch, and add the same breadcrumb to `logDbError`'s blip early-return (Security Review, Suppression Integrity). Two sites only.
4. **Add `dropNetworkBlipRethrow(event, hint)` + composed `sentryBeforeSend(event, hint)`** to `src/lib/sentry-filters.ts`; leave `dropServiceWorkerRegistrationNoise` untouched.
5. **Wire `src/main.tsx:39`** → `beforeSend: sentryBeforeSend`.
6. **Migrate all 29 sites** to `throwDbError`, preserving each message string exactly. Re-run the AST selector after migration — it must report **0**.
7. **Add the `no-restricted-syntax` rule to `eslint.config.js`.** **Gate-7 proof (required, do not skip):** revert one site (e.g. `letters-service.ts:386`) to the old shape, run `npx eslint src/app/data/letters-service.ts`, and **paste the non-zero exit code**; then restore the site and confirm exit 0. A rule never seen failing is unproven. Include the comment-separated site (`:1725`) in the check — it is the one a grep-based gate misses.
8. **Write `src/tests/p990-blip-rethrow-not-reported.test.ts`** covering, in this order:
   - **AC #1** — `throwDbError('submitPointResponse', <blip>, 'Failed to submit point response: TypeError: Load failed')` throws a `NetworkBlipError`; `sentryBeforeSend(event, { originalException: thrown })` returns `null`.
   - **AC #2** — same for `Failed to create letter: TypeError: Load failed`, driven through a *different* service function, proving genericity rather than one call site.
   - **AC #3 (the P883-harm test — the most important case)** — three sub-cases must **all** return the event un-dropped: (a) a genuine `duplicate key value violates unique constraint` error, per the AC; **(b) a genuine, non-blip `Error` whose message contains the literal text `TypeError: Load failed`** — what a broad message filter would wrongly drop, so passing it proves this design is type-keyed and not message-keyed; **and (c) a `PostgrestError` with `code: '22P02'` and message `invalid input syntax for type uuid: "Load failed"`** — a real Postgres error carrying blip text, which the **current** predicate misclassifies and drops. Case (c) is the Security Review's Input Validation finding and fails against today's code; it must pass after step 2b. Pair it with the inverse: a blip with `code: ''` and message `TypeError: Load failed` **is** classified and dropped, proving the `!error.code` gate didn't narrow blip coverage.
   - **Suppression is observable** — both suppression paths emit the `db-error-suppressed` breadcrumb, and neither emits a Sentry issue.
   - **Empty-message twin** — a `!message && !code` blip (`JAVASCRIPT-REACT-2J`) is also classified and dropped.
   - **Non-throwing sites unaffected** — `logDbError` with a blip still returns without `captureException`, and 127 graceful-degradation sites keep returning their fallbacks.
   - **AC #4** — the thrown value satisfies `instanceof Error` and `.message` equals the original string exactly.
   - **Composition** — `sentryBeforeSend` still drops SW-registration noise (P882 regression guard).
9. **Run** `npx vitest run src/tests/db-error-logger.test.ts src/tests/p882-sentry-sw-filter.test.ts src/tests/p913-unread-count-anon-no-sentry.test.ts src/tests/p883-duplicate-recipient-no-sentry.test.ts src/tests/p990-*.test.ts` and `./scripts/pre-commit-checks.sh`. Note `tsc` has an **868-error pre-existing baseline** — compare against it; do not expect zero. The two `Error`-to-`PostgrestError` `TS2345` errors at `letters-service.ts:1692` (and its sibling) should **disappear** once those sites move to `throwDbError`'s widened signature.

#### Files to Create

- `src/lib/network-blip.ts` — `NetworkBlipError` class + pure `isNetworkBlip(error)` predicate (both blip shapes). Leaf module; no imports from `src/app/`.
- `src/tests/p990-blip-rethrow-not-reported.test.ts` — regression test per step 8.

#### Files to Modify

- `src/app/data/db-error-logger.ts` — import the predicate (delete inline `:36-43` + `:50`); add `throwDbError(context, error, message): never`; add the `db-error-suppressed` breadcrumb to the blip early-return.
- `src/lib/sentry-filters.ts` — add `dropNetworkBlipRethrow(event, hint)` + composed `sentryBeforeSend(event, hint)`; `dropServiceWorkerRegistrationNoise` unchanged.
- `src/main.tsx` — `:39` `beforeSend: dropServiceWorkerRegistrationNoise` → `beforeSend: sentryBeforeSend`; update the `:7` import.
- `eslint.config.js` — add the `no-restricted-syntax` rule (Decision 2).
- `src/app/data/letters-service.ts` — **15** sites → `throwDbError` (throws at `78, 337, 386, 485, 506, 670, 849, 871, 886, 927, 1131, 1168, 1677, 1693, 1725`; `:1725` is the comment-separated one the spec's count missed).
- `src/app/data/docs-service.ts` — **9** sites (throws at `272, 496, 538, 556, 578, 599, 621, 638, 651`). Leave `:625` `SEALED_LETTERS_EXIST` alone — not a `logDbError` site.
- `src/app/data/events-service-real.ts` — **3** sites (throws at `891, 923, 938`).
- `src/app/data/points-service-real.ts` — **2** sites (throws at `865, 880`).

**Explicitly NOT modified:** the **127** non-throwing `logDbError` sites (`agreements-service-real.ts`, `badge-service-real.ts`, `calibration-service-real.ts`, `stories-service-real.ts`, and the majority of the four files above). Their graceful-degradation behavior is correct and out of scope.
