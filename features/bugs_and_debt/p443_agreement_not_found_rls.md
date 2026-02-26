---
status: today
type: bug
rank: 125484.0
workstream: C1
severity: high
date_reported: 2026-02-26
created_date: 2026-02-26
source: sim
changes: p422
tags:
  - rls
  - agreement
  - auth
---

# BUG: "Agreement Not Found" Error When Invited Party Accepts

## Problem

When the invited party (second user) navigates to an agreement via the invite link, they receive an "Agreement not found" error. The agreement exists in the database but the invited party's RLS policy does not allow them to read it before they have formally accepted.

## Symptoms

- Solo Founder creates agreement and sends invite
- Invited party opens the link
- Page shows "Agreement not found" or blank/error state
- Agreement IS in the database — this is an RLS read-access issue
- Found by Invited Party persona in sim run on `p422-p425-uat` branch

## Root Cause

_To be investigated. Likely: RLS SELECT policy on agreements table only allows the creator to read, not the invited party. Invited party needs read access to the agreement row to review it before signing._

## Resolution

_Update RLS policy to allow invited party (matched by invite token or email) to SELECT the agreement row._

## Verification

- Create agreement as User A
- Copy invite link
- Log in as User B (invited party)
- Navigate to invite URL → agreement displays correctly, no "not found" error
- User B cannot read agreements they were not invited to
