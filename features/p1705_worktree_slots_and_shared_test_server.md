---
status: week
type: task
rank: 348
workstream: infrastructure
created_date: '2026-11-18'
tags: [worktrees, test-server, self-hosted, edge-functions]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1705: A worktree on any slot works against shared TEST, and says when TEST runs another branch's server code

## Problem

> Founder framing, verbatim (2026-11-18): *"Investigate and propose (do not build yet) a sustainable fix for how worktrees and the shared TEST server interact"*, then *"you can not only propose it, you can create the spec and then review the spec and be the orchestrator ... KDD should commit after you test because I guess this is something not necessarily something I can or want to test manually."*

**Situation.** Each worktree slot has its own identity: a dev port from `scripts/lib/worktree-port.mjs` (wN = 5000 + N×100, w10 shifted to 6050) and its own branch. The shared self-hosted TEST server keeps one value for each of those: one fixed app address for mail links, hand-kept lists of accepted ports, and one copy of the edge functions (whichever branch deployed last).

**Complication.** P1675's work on w21 (port 7100), 2026-11-17 and 18, hit all of these at once:

1. **Sign-in emails linked to `localhost:5001`, three times.** Verified cause (2026-11-18): not the event-email code. TEST's auth server only accepts redirect addresses on a hand-kept list that stops at port 6500 (`ADDITIONAL_REDIRECT_URLS` on the VM: 5001, 5100…6500, 58??, the server's own address). A redirect to 7100 is rejected and replaced by the server's default address, and TEST's email template (`scripts/selfhosted/lib/email_template_drift.py`, `LOCAL_VERIFY`) turns any non-localhost redirect into `http://localhost:5001`. The TEST auth log for the last 48 h holds redirects for 5001, 5100, 5500, 5700, 6100 and 6300 and none for any port at or above 6600.
2. **Event-email links use a fixed app address too, and two fixes for that exist.** The functions container's `APP_URL` on TEST is `http://localhost:5173` (read live 2026-11-18), which no checkout uses. P1691 (on main) added `_shared/link-base.ts` `resolveLinkBase`: keyed on the request's `Origin` header, accepted only when it matches the CORS dev rule, only on a project whose address has a self-hosted/local shape. Only `send-letter-emails` and `send-agreement-emails` use it. P1675 (unshipped, w21) added `siteFor`/`localSiteFor` in `_shared/event-links.ts`: keyed on an `origin` field in the request body, gated on `APP_URL` being a localhost address, used by `send-event-emails`. Two rules, two keys, two gates. Three more functions read `APP_URL` directly (`create-and-sign`, `create-and-open-letter`, `request-letter-response-signin`), and the P1691 guard test (`src/tests/p1691-link-host-source.test.ts`) lists its link builders by hand, so it did not see either `send-event-emails` or P1675's body-field rule.
3. **The port lists stop before the slots do.** `_shared/cors.ts` `DEV_ORIGIN_RE` accepts 5001, 5100–5999, 6050, 6100–6999. w20 (7000) and w21 (7100) are refused, so every browser call to an edge function from those worktrees fails CORS. Its test (`src/tests/inbox205-cors-dev-ports.test.ts`) enumerates w1..w19 by hand and asserts 7000 is *refused* as a control, so it pins the bug. The same port set is copied, each differently, into: TEST's auth redirect list (stops at 6500), `scripts/gcs-chat-voice-bucket.sh` (stops at 6900), `scripts/gcs-cors.json` (stops at 5700), and the TEST audio bucket's CORS list (not in the repo; a task-inbox note tracks it).
4. **TEST runs one branch's functions at a time, and the place the founder tests never says so.** The E2E check (P1312, `branch-functions-check.sh`, receipts in `<git-common-dir>/cp-function-checks.jsonl`) did flag it: P1675's one receipt, 2026-11-17 10:42, reads `differs: _shared, send-event-emails (server has feature/p1700-removed-attendee-notice …, uncommitted)`. It is a warning by default. Since 2026-11-10, 52 of 222 recorded E2E runs started on another branch's code. A dev server (`npm run dev`), where the founder tests by hand, runs no check at all. And a branch that changes no function gets "no changed functions", exit 0, without looking, even when the server holds another branch's changed copy (the gap P1312 recorded as accepted).
5. **Finished slots are never removed, so slot numbers climb.** 20 worktrees exist (w1–w21 without w11 and w18). Claim takes the lowest free number from w1 to w99 (`scripts/git-ops.sh` `cmd_claim`), so the highest number in use tracks how many slots are held at once. Two defects keep finished slots alive, verified 2026-11-18:
   - **Every slot reads as dirty.** `setup-worktree.sh` links `.env.development.local` into each slot (P1557), and the cleanup check's ignore list (`scripts/lib/worktree-changes.sh`) exempts only the `.env.local` and `.env.test.local` links. Ship and archive-spec therefore always print "worktree RETAINED", and `tidy` turns a shipped slot into a question instead of a removal. Filed earlier as a task-inbox note (promoted into this spec).
   - **Holds never end.** 16 slots carry a `.hold`, 15 of them owned by the founder. A founder hold never expires and nothing but `hold --clear` removes one. The holds on w2, w4, w8 and w10 were written before those branches shipped and ask for the decision ("founder decides whether to ship") that the ship then made. For w4 and w8, which have no `.lock`, `tidy` reads the missing hold answer as "held", so they are blocked whatever the hold says.
   - The "uncommitted changes" behind the four STRANDED lines are that link plus, in w2, two screenshots under `tmp/` and, in w4, a `test-results-p1608/` folder. No real work.
   - Slot growth reached w20, whose port 7000 is taken by macOS AirPlay Receiver (ControlCenter listens on `*:7000`; Vite runs with `strictPort`), so a dev server on w20 cannot start at all. 5000 is AirPlay's other port, which is why main uses 5001.
   - Not a problem, checked: every kanban process runs from main's `tools/kanban`; nothing launches the kanban from a worktree.

**How they connect.** One cause underneath: a per-checkout identity (port, branch) meets a server that keeps one global value, and the copies of that value are hand-kept in five places. Slot growth (5) is what pushes ports past the hand-kept lists (3), which breaks sign-in links (1) and CORS. The link rule (2) depends on the CORS rule. The functions problem (4) is the same "one global value" on the code side.

**Question.** Which single rule decides a mail link's address; which port set is the scheme, derived once and checked everywhere; how does a dev server or E2E run show that TEST is serving foreign code; and what reclaims slots.

## Appetite

Blast radius: medium. Every edge function's CORS (prod included) and every mailed link pass through the touched code; a wrong link rule on prod would send prod mail to a request-chosen host. Reversibility: high, plain code plus two TEST-server settings, both restorable. Decision density: low. The port range and the slot cap are engineering choices recorded here; prevention of foreign functions is already P1679's scope.

## Invariants

- **Prod mail links come from configuration alone.** On prod, no request value (header or body) reaches a mailed link's host. Carried from P1691 (`.private/features/done/2026-06-10/p1691_server_function_input_checks.md`, private ruling, summary: the dev exception applies only on a project positively known not to be prod).
- **One definition of the dev port set.** `scripts/lib/worktree-port.mjs` is the only definition (P1480). Every other place either derives from it or is checked against it by a test that fails on difference (epistemic gate 7e: derived members, at least one known member per path).
- **Detect, do not auto-deploy.** No check deploys functions on its own (decisions.md 2026-11-05, P1312). Prevention by lanes stays with P1679 (decisions.md 2026-11-15, P1672).
- **Nothing destructive trusts a liveness verdict** (decisions.md 2026-09-17, P1326). Slot reclamation never removes a worktree that holds uncommitted work or a founder hold.

## Solution

### A. One mail-link rule (symptoms 1, 2)

- `_shared/link-base.ts` becomes the only module that reads `APP_URL`. It exposes one call that takes the request (or none, for scheduled sends) and returns the base: `APP_URL`, except a request whose `Origin` header matches the CORS dev rule on a known non-prod project. P1691's gate (project-address shape) is kept; P1675's gate (`APP_URL` is localhost) and its body `origin` field are not.
- `send-event-emails` (and its ticket and event-page links), `create-and-sign`, `create-and-open-letter` and `request-letter-response-signin` take their base from it. Scheduled senders (`event-dispatch`, `starting-soon`) call it with no request and get `APP_URL`.
- The P1691 guard test derives its scope: every function that builds a mailed link, and a new rule that no module other than `link-base.ts` reads `APP_URL` or accepts a localhost origin by its own parsing.
- **P1675 coordination.** P1675 is unshipped on w21 and is not edited by this work. Whichever of the two lands second removes `siteFor`, `localSiteFor` and the client's body `origin` field; the extended guard test fails P1675's rebase onto main until it does. P1675's spec gets a one-line pointer.
- TEST's fallback `APP_URL` becomes `http://localhost:5001` (the main checkout), recorded in the repo-managed place the deploy script reads, so it cannot drift back to an unused port.

### B. One port scheme (symptom 3)

- `worktree-port.mjs` gains an explicit slot cap, `MAX_SLOT = 49` (top port 9900: below the restricted 10080, and four digits, which TEST's email template relies on when it slices the redirect address), and a function that returns the full dev-origin set (main, w1..w49 after shifts, the 5800–5899 named range). A slot above the cap throws, and claim stops at the same cap.
- The shift that moves browser-restricted ports by 50 also moves ports a Mac service holds: 7000 (AirPlay Receiver) becomes 7050. w20's port therefore changes from 7000, where its dev server cannot start, to 7050.
- `DEV_ORIGIN_RE` accepts exactly `5001` and `5100–9999`. The CORS test derives every slot from the allocator up to `MAX_SLOT`; controls: 5000, 10000, 3000 refused; `MAX_SLOT + 1` throws.
- The TEST auth redirect list is generated from the allocator's set and applied to the VM by a repo script; the existing TEST health/drift check gains a comparison so a hand edit shows as drift. Lanes copy the main list today (`lanectl.py`), so they inherit it.
- `gcs-chat-voice-bucket.sh` and `gcs-cors.json` take their localhost entries from the allocator (generated, or checked by a test). Applying a changed list to a live bucket is a separate, announced step (see Risks).

### C. Show foreign server code where people test (symptom 4)

- **Dev server.** `npm run dev` runs `branch-functions-check.sh` in the background at start and again every 15 minutes, never blocking Vite. A non-match shows a dev-only banner in the app naming the branch the server holds and the fix command; a match or "no changed functions on a clean server" shows nothing. Prod builds contain none of it.
- **Close the client-only gap.** A branch that changes no function is compared with main's tip for the functions it calls, so "TEST holds another branch's `send-event-emails`" is reported as `differs` even when this branch changed nothing.
- **E2E** keeps its warning default (P1312) and prints the `differs` line in the run's final summary, not only at setup.
- Prevention (a lane per function-changing branch, VM refusing branch deploys to the main lane) is P1679. Its spec gets the receipt evidence above, which meets P1312's recorded condition for revisiting prevention ("until the receipts show evidence runs regularly waiting on redeploys").

### D. Slot reclamation (symptom 5)

- The cleanup check ignores `.env.development.local` when it is the setup link, in both places the ignore list appears, like the other two setup links. A real file of that name still counts.
- A hold ends with the decision it waits for. Ship and archive-spec clear the hold of the slot they finish, and `tidy` treats a hold written before the slot's branch was recorded as shipped as ended. A hold on an unshipped branch (a design exploration, built-but-unshipped work) is untouched.
- `tidy` reads a slot's hold from the slot itself, so a slot without a `.lock` is judged by its real hold, not by a missing answer.
- Removal itself stays where it is (`/day`'s tidy step, ship, archive-spec). This work removes no worktree; after it, tidy's dry run is the evidence.

## Alternatives Considered

**Mail-link rule.** (a) Keep P1675's body field: rejected, a body field is sent by app code and needs every caller changed; the `Origin` header is set by the browser on every cross-origin call with no client change, and P1691's guard already reasons about it. (b) Store the registering origin per RSVP so scheduled reminders link back too: rejected, schema for a dev-only convenience; reminders keep `APP_URL`.

**Port scheme.** (a) Cap at w19 and keep every list as is: rejected, 20 slots are in use today, most held by the founder, so a cap of 19 would refuse new work. (b) Accept any localhost port: rejected, CORS runs on prod too, and a bounded range keeps the GCS lists (exact origins, no wildcards) enumerable. (c) Re-stride the scheme to keep more slots under 7000: rejected, it moves every existing slot's port, breaking running servers and the URLs in founder holds.

**Slot reclamation.** (a) Expire every founder hold after N days: rejected, design explorations are held for weeks on purpose. (b) Have ship delete the worktree regardless of leftovers: rejected by the P1326 invariant.

**Foreign functions.** (a) Make E2E fail by default on `differs`: rejected for now, the only remedy is to redeploy over the other branch, which starts a redeploy war; lanes (P1679) are the real fix. (b) A public deploy-info endpoint on TEST read by the browser: rejected, new server surface; reusing the tested check adds no unit on the server.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Prod CORS widened from 5100–6999 to 5100–9999 localhost | ACCEPT | Same class as today: no credentials are sent, prod mail ignores the origin. |
| A wrong redirect list on the TEST VM breaks sign-in for every worktree | MITIGATE | Generate, show the diff, keep the previous value for restore, verify with one sign-in from a high slot and one from 5001. |
| Changing a live GCS bucket's CORS | MITIGATE | Repo lists are fixed and checked here; applying them to a live bucket is announced first and verified with the existing verify script. |
| 20 dev servers each opening an IAP SSH session every 15 min | ACCEPT | IAP is not metered; the check has a 45 s deadline and one call. |
| P1675 lands first with `siteFor` | MITIGATE | The guard test on main fails the next rebase that carries it. |
| Clearing a founder hold the founder still wanted | MITIGATE | Only a hold older than its branch's recorded ship ends, and a slot with real leftovers is still only a question, never a removal. |
| w8's port 5800 lies inside the 5800–5899 named range | ACCEPT | A named worktree collides only when its hash lands on 00; none is in use. |

**Non-Goals**
- Do NOT edit any other session's worktree (w21 included).
- Do NOT build lanes, a second lane, or VM-side deploy refusal (P1679).
- Do NOT change prod's `APP_URL`, prod auth settings or prod buckets' values beyond the localhost entries.
- Do NOT move any existing slot's port, except w20 (7000, unusable on a Mac).
- Do NOT remove any worktree as part of this work.

## Done-When

- [ ] A sign-in email requested from a dev server on a slot at or above w16 (e.g. 7100) links back to that port; a request from 5001 still links to 5001 (TEST auth log and the received link).
- [ ] An event confirmation triggered from a non-main dev port on TEST links to that port; the same function on a prod-shaped project ignores the `Origin` and uses `APP_URL` (Deno tests through the function entry point).
- [ ] No module other than `link-base.ts` reads `APP_URL`; the guard test's scope is derived and its control (a seeded second reader) fails.
- [ ] CORS accepts every slot the allocator can return up to `MAX_SLOT`, and refuses 5000, 10000 and 3000; a slot above `MAX_SLOT` throws (tests, with the failing control shown first).
- [ ] The TEST auth redirect list equals the allocator's set, and the drift check reports a hand-removed entry.
- [ ] Both GCS localhost lists equal the allocator's set (test).
- [ ] A dev server on a branch whose functions differ from TEST shows the banner within one check; a matching branch shows none; a prod build contains no banner code.
- [ ] A branch with no function changes reports `differs` when TEST holds another branch's copy of a function it calls (hermetic test plus one live read).
- [ ] A slot whose only extra file is the `.env.development.local` setup link is reported clean by the cleanup check; a real `.env.development.local` file still counts (test with both).
- [ ] Shipping a held slot clears its hold; a hold on an unshipped branch survives ship of another branch and a tidy run (test).
- [ ] `git-ops.sh tidy --all` (dry run, no `--apply`) reports REMOVE for w8 and w10 and a one-line question for w2 and w4, where today it reports KEEP for all four. No worktree is removed by this work.
- [ ] `worktree-port.mjs` returns 7050 for w20 and never returns 5000 or 7000.
- [ ] `docs/technical/worktree-setup.md` states the port scheme, the cap and how a new slot is supported, with nothing to edit by hand.

## Rollback Strategy

Code: revert the commit. TEST auth redirect list and `APP_URL`: the apply script keeps the previous value and restores it. GCS lists: re-apply the previous JSON with the existing set script.

## Related

- P1691 (link-base, private spec), P1675 (siteFor, w21), P1480 (port scheme), P1312 (branch functions check), P1672 / P1679 (TEST lanes), P1326 (worktree liveness), P1450 (agents tidy worktrees), P1557 (TEST env link), the task-inbox note on the audio bucket CORS list. Promoted from the task inbox, 2026-11-18 (the setup-link note).
