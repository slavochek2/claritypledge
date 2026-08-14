---
status: backlog
type: task
rank: 46
workstream: foundation
created_date: 2026-04-03T00:00:00.000Z
tags: []
---

# P639: Wire up hCaptcha on Supabase auth endpoints

## Goal

Add CAPTCHA protection to magic link OTP auth flow to prevent email spam abuse (credential stuffing is lower risk given OTP, but unsolicited magic link flooding is real).

## Context

Security audit finding. hCaptcha account already created — need site key + secret key from hCaptcha dashboard before starting.

Risk profile: medium importance, low urgency. Target: before next growth push.

## Steps

1. Enable hCaptcha in Supabase via Management API (prod ref `besjtuodziykmjidubzw`, test ref `gfjctyxqlwexxwsmkakq`)
2. `npm install @hcaptcha/react-hcaptcha`
3. Create `src/app/components/auth/CaptchaWidget.tsx` with `<CaptchaWidget>` + `useCaptcha()` hook
4. Find all `signInWithOtp` / `signUp` call sites — add `options: { captchaToken }` to each
5. Add widget to each auth form (above submit button)
6. Set `VITE_HCAPTCHA_SITE_KEY` in `.env.local`, `.env.example`, and Vercel prod env
7. Test with hCaptcha test keys locally; verify token passes through to Supabase logs

## What NOT to do

- Don't add CAPTCHA to OAuth (Google login) — has its own bot protection
- Don't block auth if key is missing — graceful degradation
- Don't use `@marsidev/react-turnstile` — wrong library

## Done When

- [ ] hCaptcha widget renders on magic link form
- [ ] `captchaToken` passed to every `signInWithOtp` call
- [ ] Auth flow works end-to-end with CAPTCHA verified
- [ ] Gracefully skips in dev when `VITE_HCAPTCHA_SITE_KEY` not set
- [ ] Supabase logs show captcha validation passing
