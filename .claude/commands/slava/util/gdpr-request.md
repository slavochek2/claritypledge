---
name: gdpr-request
description: Handle one GDPR data-subject request (erasure, consent withdrawal, objection) end to end — identity, census on prod and processors, founder-approved action, proof with controls, private log, dry legal reply.
when_to_use: An email invokes GDPR rights (Art. 7, 15-21) or asks to be deleted, removed or unsubscribed from everything. Triggered by /gdpr-request <requester-email>.
version: 1.1.0
spec: features/p1668_gdpr_data_subject_request_procedure.md
---

# /gdpr-request <requester-email>

No argument → ask for the address and stop. Never infer it.

**Deadline:** one month from receipt (Art. 12(3)); the privacy policy says 30 days, use whichever ends
first. Extension (complex cases) only by telling the requester within the first month. Never name the
requester in a public file or commit message (`.claude/rules/pii.md`); identifying detail goes only to
`.private/docs/gdpr-requests.md`.

**Resume first:** read `.private/docs/gdpr-requests.md`; an open or recent case for this address → continue
it, do not start over.

## 1. Classify

| Request | Path |
|---|---|
| Erasure (Art. 17) / "delete everything" | 2 → 3 → 4b storage → 4a → 4b processors → 5 → 6 → 7 |
| Objection only (Art. 21: analytics, newsletter) | 2 → 3 → 4b (Ghost member delete, Mixpanel/Sentry deletion) → 5 (processors only) → 6 → 7. Never run 4a |
| Withdrawal only (Art. 7(3): recordings, voice profile, quote) | 2 → 3 → founder decides the exact items and how to delete them (no generic tool exists) → 5 for those items → 6 → 7. Never run 4a |
| Access / portability (Art. 15/20) | No export tool exists. Tell the founder now, with the deadline; the requester still gets an answer within the month |

Ambiguous → ask the founder, quoting the request.

## 2. Identity (Art. 12(6)) — fail closed, every path

- Raw headers: Gmail MCP `get_message` (format with headers) if the message is in that mailbox; otherwise
  ask the founder to paste the `Authentication-Results` header. Require `dmarc=pass` from our own receiving server's
  `Authentication-Results`, and the `From` address equal to the requester's. Missing or failed → reply asking the requester to confirm from the account address; do
  nothing else.
- Read-only on prod:
  `python3 scripts/supabase-readonly-sql.py --env prod "select id, email, created_at from auth.users where lower(email)=lower('<email>')"`.
  One row → that uid. Zero in `auth.users` and `auth.identities` with DMARC passing → no account; continue to
  step 3 with the address only (skip uid probes and 4a). Otherwise zero → check `auth.identities` (`identity_data->>'email'`) and the profile name; a hit
  there authorizes nothing until the requester confirms from that address. Two or more → stop for the founder.

## 3. Census — snapshot BEFORE anything is deleted

Erasure severs the joins needed to find external data. Write every result into the case log first.

FK census (derived from the catalog, not a hand list):

```sql
with fks as (select c.conrelid::regclass::text tbl, a.attname col from pg_constraint c
  join pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey)
  where c.contype='f' and c.confrelid in ('public.profiles'::regclass,'auth.users'::regclass)
  and array_length(c.conkey,1)=1)
select tbl, col, (xpath('/row/n/text()', query_to_xml(format('select count(*) n from %s where %I = %L',
  tbl, col, '<uid>'), false, true, '')))[1]::text::int n from fks order by 3 desc
```

Then, each with `supabase-readonly-sql.py --env prod`:
- Email columns: `select table_name, column_name from information_schema.columns where table_schema='public' and column_name ilike '%email%'`, then count the address in each.
- `email_send_log` rows for the uid: erasure only sets `profile_id` to NULL, the Mailgun message ids survive. Record them.
- `storage.objects` by owner; session ids the uid joined (needed later to find audio and voice profiles in Google Cloud Storage).
- RSVPs (event titles), groups, chats, letters, agreements; grep `src/` and `content/` for the name (quotes, testimonials).

Processors: derive the list from the "Who Processes Your Data" table in `src/app/content/privacy.md` each run.
Known probes:
- Mixpanel (MCP `Run-Query`, project from `Get-Projects`): insights on `$all_events`, breakdown by event property `$user_id`, window from signup to today. Not `distinct_id`: it is undefined on every event.
- Sentry (MCP `search_errors` / `search_replays`): `user.id:<uid>`.
- Ghost Admin API (`GHOST_ADMIN_API_KEY`, keyring; JWT as in `ship-blog.md` § Ghost API Auth): `curl -G --data-urlencode "filter=email:'<email>'" .../ghost/api/admin/members/` (URL-encode: a `+` otherwise reads as a space).
- Mailgun / Brevo: sign-in and notification delivery logs; they expire on the provider's schedule, so record them, don't delete them.
- Tally / Web3Forms: ask the founder to search submissions.
- Outside our systems (WhatsApp groups): list for the founder.

**Every zero needs a control: the identical probe run on a different, known-existing person or address must
return >0.** Never use the requester's own id after erasure as the control. If the control is also 0, the
probe is blind: change the property, don't accept the zero.

## 4a. Erasure (after the storage deletions in 4b) — founder approval, prod stated

Tell the founder: "prod: erase uid <uid> (<email>)", and that a Keychain dialog follows (answer Allow).
Then, one statement batch over the Management API (`/database/query` runs it in one session; verified
2026-11-12):

```bash
source scripts/keyring.sh
KEYRING_REASON="GDPR erasure of one account on prod" keyring_require PROD_SUPABASE_ACCESS_TOKEN || exit 1
SQL=$(cat <<'EOF'
begin;
select set_config('request.jwt.claims', json_build_object('sub','<uid>','role','authenticated')::text, true);
do $g$ begin if (select lower(email) from auth.users where id='<uid>') is distinct from lower($e$<email>$e$)
  then raise exception 'uid/email mismatch'; end if; end $g$;
select public.erase_my_account() as result;
commit;
EOF
)
curl -sS -X POST "https://api.supabase.com/v1/projects/besjtuodziykmjidubzw/database/query" \
  -H "Authorization: Bearer $PROD_SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  --data "$(python3 -c 'import json,sys;print(json.dumps({"query":sys.argv[1]}))' "$SQL")"
```

Read `result`: `auth_user_deleted` must be `true`. Note `sessions_anonymised`, `points_orphaned`,
`events_orphaned` and the other counts in the case log; anything non-zero survives without the name and
goes on the reply's Retained line. Never hand-write DELETEs: the function owns lock order and survival rules.

## 4b. Processors — founder approval

Storage: `erase_my_account()` does not touch file storage. For every `storage.objects` row and every GCS
audio or voice-profile object found in step 3, list the exact paths to the founder, then delete them on approval
(`gsutil rm <path>`; Supabase storage via the Storage API). Payments (Stripe): keep, with the accounting-law
basis, and say so in the reply.

Ghost: `DELETE /ghost/api/admin/members/<id>/` for each member found. **Objection or withdrawal with the
account kept:** deletion alone is undone by the next `/slava:client:sync-ghost-members` run and by future
analytics, so add the address to the suppression list in `.private/docs/gdpr-requests.md` (§ Suppressed) and
tell the founder that the sync skill and analytics must honour it; until they do, the case stays open and no reply may claim the objection is in effect; send a status reply
naming what is done and what is pending. Mixpanel / Sentry: file deletion
through their GDPR deletion tools when step 3 found data; log the ticket ids.

## 5. Prove

Re-run the step-3 probes that apply to the path taken, with their controls. Erasure path: every count 0,
except rows the function deliberately keeps unlinked (`email_send_log`, anonymised shared sessions), which must
no longer carry the uid; and
`select same_name_sessions from public.erased_subjects where user_id='<uid>'` returns one row with `[]`; a
non-empty list holds sessions where both participants had the same session-time name, which the function
could not split safely; their name-keyed content is left in place, so resolve each one with the founder.
This census proves only what its probes cover: it cannot see unlinked ids inside JSON or text.
An async processor ticket is "requested" until the provider confirms it.

## 6. Log (private) — written as you go

Create the case entry at step 2 and append each step's result the moment it completes, so an interrupted run
can resume. At the end, check it holds to `.private/docs/gdpr-requests.md`: received, deadline, rights, identity evidence, footprint before,
actions and results, controls, tickets, reply date. Retention: [FOUNDER DECISION, default 3 years].

## 7. Reply — minimal, dry. The founder sends it.

Every sentence is a claim the requester can test, so write the fewest that answer what was asked. Rules:

- **Claim only what this run verified.** Never say a provider erased or was asked to erase anything unless a
  deletion request was actually filed and confirmed. Never say data was "not shared with anyone" or "only"
  processed by X: event attendees, chat members and email-delivery logs make that hard to prove.
- **Recipients:** point to the provider list in the privacy policy. Do not enumerate, do not assert outcomes.
- **No extras:** no list of data we never held, no complaint-rights line (required only when refusing or not
  acting), no warmth, no feedback question, no em dashes.
- Anything pending → say what is done and what is pending, never "completed".

Erasure template (founder-approved 2026-11-12). Name what was deleted and what remains; never "all data":

---
Subject: Your GDPR request

Dear <Name>,

<Your request has been completed. | We have processed your request; <provider> deletion is still pending.> We have deleted your account and the following personal data: <items actually deleted, e.g. profile, email address, sign-in data, event registration>. All consents are withdrawn.

What remains: a record of your request and its completion, kept as evidence that it was carried out (Art. 17(3)(e) GDPR)<, and delivery logs of emails we sent you, which our email provider deletes automatically><, payment records kept under accounting law><, content you shared with others, kept without your name>.

The service providers that process data on our behalf are listed in our privacy policy (claritypledge.com/privacy).

TechSalesBox OÜ
---

Objection or withdrawal: same shape, first paragraph names exactly what stopped ("We no longer use your data
for <purposes>."), and keep the "What remains" line (the case log is always retained).
