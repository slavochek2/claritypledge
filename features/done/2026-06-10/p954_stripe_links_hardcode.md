---
id: p954
title: "Hardcode public Stripe payment links — fix prod checkout outage"
type: bug
status: all-done
pipeline_ran: [dev, ship]
completed_at: 2026-06-19
tags: []
rank: 1000951.0
created_date: 2026-06-19
---

## Problem

Stripe payment links were loaded from `VITE_STRIPE_STANDARD_URL` / `VITE_STRIPE_PREMIUM_URL` env vars.
These vars were never set in Vercel dashboard — only in gitignored `.env.local`.
Result: prod bundle baked empty strings → `isStripeLink("")` = false → "Checkout temporarily unavailable" on both paid tiers.

Confirmed by grepping live prod bundle: zero `buy.stripe.com` hits.

## Fix

Hardcode both public Stripe links as in-source defaults (env-var override retained for test-mode links).
Stripe payment links are public URLs — no secrets exposed.

## Acceptance Criteria

- [x] `/pricing` Standard CTA links to buy.stripe.com (not disabled)
- [x] `/pricing` Premium CTA links to buy.stripe.com (not disabled)
- [x] Build without Stripe env vars bakes both links into bundle
