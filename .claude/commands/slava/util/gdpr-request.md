---
name: gdpr-request
description: Handle one GDPR data-subject request (erasure, consent withdrawal, objection) end to end — verify identity, census the person's data on prod and every processor, act with founder approval, prove completion with controls, log privately, draft a dry legal reply. - When an email invokes GDPR rights (Art. 7, 15-21) or asks to be deleted/removed/unsubscribed from everything. Triggered by /gdpr-request <email>.
version: 1.0.0
spec: features/p1668_gdpr_data_subject_request_procedure.md
---

# /gdpr-request <requester-email>

Statutory clock: **one calendar month** from receipt (Art. 12(3)); the policy promises 30 days, use the
shorter. Record the received date first. Never name the requester in any public file or commit message
(`.claude/rules/pii.md`); everything identifying goes to `.private/docs/gdpr-requests.md`.

## 1. Classify — decides whether the account is erased at all

| Request | Action |
|---|---|
| Erasure (Art. 17) / "delete everything" / "remove me from everything" | Full path (steps 2-7) |
| Objection only (Art. 21: analytics, newsletter, session recording) | Do NOT run `erase_my_account()`. Ghost unsubscribe/delete, Mixpanel + Sentry deletion, then step 6-7 |
| Withdrawal only (Art. 7(3): recordings, voice profile, quotes) | Do NOT erase the account. Delete the named recordings/transcripts/voice profile/quote, then 6-7 |
| Access / portability (Art. 15/20) | Out of scope: no export tool exists. Tell the founder; file a spec |

Ambiguous → ask the founder which, quoting the request.

## 2. Identity (Art. 12(6)) — fail closed

- Open the email's raw headers. Require `dkim=pass` or `spf=pass` aligned with the `From` domain. Missing or
  failed → reply asking the requester to confirm from the account address. Do nothing destructive.
- Read-only on prod: `python3 scripts/supabase-readonly-sql.py --env prod` — `auth.users` by exact email.
  Exactly one row → that uid. Zero rows → also search by name and by Google identity email
  (`auth.identities.identity_data->>'email'`); a match there that is not the sender address needs the
  requester to confirm from that address. Two or more → stop for the founder.

## 3. Census — snapshot BEFORE anything is deleted

Erasure severs the links needed to find external data, so capture everything first, into the private log:

- FK census, derived (never a hand list): every single-column FK in `pg_constraint` whose target is
  `public.profiles` or `auth.users`, count of rows = uid (the `query_to_xml` count pattern).
- Email-keyed tables: grep `information_schema.columns` for `%email%`, count the address.
- `email_send_log` rows for the uid: **erasure only unlinks them** (`profile_id = NULL`), the Mailgun
  message ids survive. Note them.
- `storage.objects` by owner/name; GCS audio/voice-profile objects for every session the uid joined (list
  the session ids now — erasure removes the join).
- Event RSVPs (titles), groups, chats, letters, agreements, quotes/testimonials (grep `src/` and `content/`).
- Processors: every row of the "Who Processes Your Data" table in `src/app/content/privacy.md` — derive the
  list from that file each run. For each: holds data on this person? (Mixpanel: `$user_id` breakdown;
  Sentry: `user.id`; Ghost: member filter by email; Tally/Web3Forms: search submissions; Mailgun/Brevo:
  delivery logs only, auto-expire.)
- Outside our systems (WhatsApp groups etc.): list for the founder to handle by hand.

**Every zero needs a control** through the identical probe: a known existing id/email must return >0.
A probe whose control also returns 0 is blind — change the property, never accept the zero
(2026-11-12: Mixpanel `distinct_id` was undefined on every event; `$user_id` worked).

## 4. Act — founder approval for each destructive step, prod stated

Erasure, after the founder says yes, via the Management API (key: `PROD_SUPABASE_ACCESS_TOKEN`, keyring
dialog; announce it). One transaction, uid guard inside it:

```sql
begin;
select set_config('request.jwt.claims','{"sub":"<uid>","role":"authenticated"}',true);
do $$ begin if (select email from auth.users where id='<uid>') is distinct from '<email>'
  then raise exception 'uid/email mismatch'; end if; end $$;
select public.erase_my_account() as result;
commit;
```

Never hand-write DELETEs: the function owns lock order and survival rules. Then processors found in step 3
(Ghost member delete; Mixpanel/Sentry deletion requests via their GDPR tools, log the ticket ids).

## 5. Prove

Re-run the step-3 census (same queries) plus controls. Every count 0, every control >0. `erased_subjects`
holds one row for the uid, and its `same_name_sessions` must be `[]`; non-empty means sessions that
matched by name only were recorded, not cleaned, so resolve them by hand with the founder. Async processor tickets: wait for completion before claiming erasure, or say
"requested" in the reply.

## 6. Log (private)

Append to `.private/docs/gdpr-requests.md`: received, deadline, rights invoked, identity evidence,
footprint before, actions + results, controls, processor tickets, reply date. Retention:
[FOUNDER DECISION, default 3 years].

## 7. Reply — dry, legal, short. The founder sends it.

No warmth, no marketing, no em dashes. Fill only true lines; delete the rest.

---
Subject: Your GDPR request of <date>

Dear <Name>,

We confirm completion of your request under Articles <list> GDPR, received on <date>.

Erased: <account, profile, email address, sign-in data, event registration(s), ...>. All consents are withdrawn and no further processing takes place.

Recipients (Art. 19): your data was processed only by our processors <list>. <Erasure requested from X, Y / No data was held by X, Y.> It was not disclosed to any other third party.

Retained: one record containing only a pseudonymous account identifier, as evidence of this erasure (Art. 5(2) and 17(3)(e) GDPR), kept for <period>. Database backups containing your data are overwritten within <n> days.

TechSalesBox OÜ
---
