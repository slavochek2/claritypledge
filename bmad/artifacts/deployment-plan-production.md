# Clarity Pledge Production Deployment Plan

**Document Version:** 1.0
**Created:** 2025-12-01
**Status:** Ready for Review

---

## Executive Summary

This document provides a comprehensive plan for deploying the Clarity Pledge application to production. The application is a React + TypeScript + Vite frontend with Supabase backend (PostgreSQL + Auth). Deployment requires creating a production Supabase project, configuring Vercel hosting, setting up a custom domain, and configuring SMTP for magic link emails.

---

## Table of Contents

1. [Phase 1: Code Review & Bug Fixing](#phase-1-code-review--bug-fixing)
2. [Phase 2: Production Supabase Setup](#phase-2-production-supabase-setup)
3. [Phase 3: Vercel Configuration](#phase-3-vercel-configuration)
4. [Phase 4: Custom Domain Setup](#phase-4-custom-domain-setup)
5. [Phase 5: SMTP Configuration](#phase-5-smtp-configuration)
6. [Phase 6: Go-Live Checklist](#phase-6-go-live-checklist)
7. [Post-Launch Monitoring](#post-launch-monitoring)
8. [Rollback Procedures](#rollback-procedures)

---

## Phase 1: Code Review & Bug Fixing

### 1.1 Pre-Deployment Code Audit

#### Critical Files to Review

| File | Purpose | Review Focus |
|------|---------|--------------|
| `src/auth/AuthCallbackPage.tsx` | Profile creation after magic link | Ensure no race conditions, proper error handling |
| `src/auth/useAuth.ts` | Auth state management | Read-only pattern preserved |
| `src/lib/supabase.ts` | Supabase client | Environment variable validation |
| `src/lib/supabase-admin.ts` | Admin client (tests only) | **MUST NOT be imported in production code** |
| `src/app/data/api.ts` | All database operations | Review all queries for security |
| `supabase/schema.sql` | Database schema + RLS | Verify policies are complete |

#### Security Checklist

- [ ] **No hardcoded credentials** in source code
- [ ] **No admin client imports** in production code paths
- [ ] **All user input validated** (forms use Zod validation)
- [ ] **RLS policies active** on all tables
- [ ] **No SQL injection vulnerabilities** (using Supabase client, not raw SQL)
- [ ] **CORS configured correctly** (Supabase Dashboard)
- [ ] **Debug routes protected or removed** (`/debug`, `/test-db`, `/diagnostic`)

#### Known Issues to Address

| Issue | Location | Priority | Action |
|-------|----------|----------|--------|
| Debug routes exposed | `src/App.tsx` | High | Remove or add auth guard |
| Console logging verbose | `src/app/data/api.ts` | Low | Reduce in production |
| E2E tests partially skipped | `e2e/*.spec.ts` | Medium | Fix before launch or document |

### 1.2 Code Quality Checks

```bash
# Run all checks before deployment
npm run lint                    # ESLint - fix all errors
npm run build                   # Verify build succeeds
npm test                        # Run unit tests
npm run test:e2e                # Run E2E tests
npm run preview                 # Manual smoke test
```

#### Expected Test Results

- **Unit Tests:** All tests should pass
- **E2E Tests:** Current status: 10/17 passing, 6 skipped (session detection limitation)
- **Build:** Should complete without errors
- **TypeScript:** No type errors allowed

### 1.3 Bug Fixing Priorities

#### P0 - Blockers (Must Fix Before Launch)

1. Any authentication flow failures
2. Profile creation errors
3. RLS policy violations
4. Build failures

#### P1 - High Priority

1. Debug routes accessible without auth
2. Error states not user-friendly
3. Mobile responsiveness issues

#### P2 - Medium Priority (Can Launch With)

1. Performance optimizations
2. SEO meta tags
3. Analytics integration

---

## Phase 2: Production Supabase Setup

### 2.1 Create Production Project

1. **Go to** [Supabase Dashboard](https://supabase.com/dashboard)
2. **Create New Project**
   - Organization: Select or create
   - Name: `clarity-pledge-prod`
   - Database Password: Generate strong password (save securely)
   - Region: Select closest to target users (e.g., `us-east-1`)
   - Pricing Plan: Pro recommended for production

3. **Save These Credentials Securely:**
   - Project URL: `https://xxxxx.supabase.co`
   - Anon Key: `eyJhbGciOiJI...`
   - Service Role Key: `eyJhbGciOiJI...` (NEVER expose to client)
   - Database Password: (for direct DB access if needed)

### 2.2 Database Schema Setup

1. **Navigate to:** SQL Editor in Supabase Dashboard
2. **Run the complete schema** from `supabase/schema.sql`:

```sql
-- Copy entire contents of supabase/schema.sql
-- Execute in SQL Editor
```

3. **Verify tables created:**
   - `profiles` table with all columns
   - `witnesses` table with all columns
   - RLS policies enabled on both
   - `handle_new_user()` trigger created

### 2.3 Authentication Configuration

**Navigate to:** Authentication → URL Configuration

| Setting | Development | Production |
|---------|-------------|------------|
| Site URL | `http://localhost:5173` | `https://yourdomain.com` |
| Redirect URLs | `http://localhost:5173/auth/callback` | `https://yourdomain.com/auth/callback` |

**Add ALL redirect URLs:**
```
https://yourdomain.com/auth/callback
https://www.yourdomain.com/auth/callback
```

### 2.4 Email Templates

**Navigate to:** Authentication → Email Templates

#### Magic Link Template

Customize the "Magic Link" template:

**Subject:**
```
Your Clarity Pledge Sign-In Link
```

**Body (HTML):**
```html
<h2>Welcome to the Clarity Pledge</h2>
<p>Click the button below to complete your verification:</p>
<p><a href="{{ .ConfirmationURL }}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Verify Email</a></p>
<p>This link expires in 24 hours.</p>
<p>If you didn't request this, you can safely ignore this email.</p>
```

#### Confirm Signup Template

Similar customization for initial signup confirmation.

### 2.5 API Settings

**Navigate to:** Settings → API

| Setting | Value |
|---------|-------|
| JWT Expiry | 3600 (1 hour) - default is fine |
| Max Rows | 1000 (default) |
| Enable Logs | Yes |

---

## Phase 3: Vercel Configuration

### 3.1 Connect Repository

1. **Go to** [Vercel Dashboard](https://vercel.com/dashboard)
2. **Import Git Repository**
   - Select GitHub/GitLab/Bitbucket
   - Choose `polymet-clarity-pledge-app` repository
   - Grant necessary permissions

3. **Configure Project**
   - Framework Preset: **Vite**
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`

### 3.2 Environment Variables

**Add these in Vercel Project Settings → Environment Variables:**

| Name | Value | Environment |
|------|-------|-------------|
| `VITE_SUPABASE_URL` | `https://xxxxx.supabase.co` | Production |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGciOiJI...` | Production |

**Optional:**
| Name | Value | Environment |
|------|-------|-------------|
| `VITE_ALLOW_DUPLICATE_NAMES` | `true` | Production (if needed) |

**NEVER add:**
- `SUPABASE_SERVICE_ROLE_KEY` - this is for testing only

### 3.3 Create vercel.json Configuration

Create `vercel.json` in project root for SPA routing:

```json
{
  "rewrites": [
    { "source": "/((?!api|_next|.*\\..*).*)", "destination": "/index.html" }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-XSS-Protection", "value": "1; mode=block" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" }
      ]
    }
  ]
}
```

### 3.4 Deploy Settings

| Setting | Recommended Value |
|---------|-------------------|
| Production Branch | `main` |
| Auto Deploy | Enabled |
| Preview Deployments | Enabled (for PRs) |

---

## Phase 4: Custom Domain Setup

### 4.1 Domain Provider Configuration

**At your domain registrar (e.g., Namecheap, GoDaddy, Cloudflare):**

1. **Add DNS Records:**

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | @ | `76.76.21.21` | Auto |
| CNAME | www | `cname.vercel-dns.com` | Auto |

*Note: Vercel IPs may vary - check Vercel dashboard for current values*

### 4.2 Vercel Domain Setup

1. **Navigate to:** Project Settings → Domains
2. **Add Domain:** `yourdomain.com`
3. **Add www redirect:** `www.yourdomain.com` → `yourdomain.com`
4. **SSL:** Automatically provisioned by Vercel

### 4.3 Update Supabase URLs

After domain is active, update Supabase:

1. **Site URL:** `https://yourdomain.com`
2. **Redirect URLs:** Add all variations
   - `https://yourdomain.com/auth/callback`
   - `https://www.yourdomain.com/auth/callback`

---

## Phase 5: SMTP Configuration

### 5.1 Choose SMTP Provider

**Recommended Options:**

| Provider | Free Tier | Cost | Best For |
|----------|-----------|------|----------|
| **Resend** | 100 emails/day | $20/mo 50k | Modern API, easy setup |
| **SendGrid** | 100 emails/day | $19.95/mo 50k | Established, reliable |
| **Postmark** | 100 emails/mo | $15/mo 10k | Transactional focus |
| **AWS SES** | 62k free (first year) | $0.10/1000 | Scalable, technical setup |

**Recommended for Clarity Pledge:** Resend or SendGrid

### 5.2 Resend Setup (Recommended)

1. **Sign up** at [resend.com](https://resend.com)
2. **Verify your domain:**
   - Add DNS records (SPF, DKIM, DMARC)
   - Wait for verification (usually minutes)
3. **Create API key**
4. **Note credentials:**
   - SMTP Host: `smtp.resend.com`
   - Port: `465` (SSL) or `587` (TLS)
   - Username: `resend`
   - Password: Your API key

### 5.3 Configure Supabase SMTP

**Navigate to:** Project Settings → Authentication → SMTP Settings

| Field | Value |
|-------|-------|
| Enable Custom SMTP | Enabled |
| Sender email | `noreply@yourdomain.com` |
| Sender name | `Clarity Pledge` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | Your Resend API key |

### 5.4 DNS Records for Email

Add these DNS records for email deliverability:

**SPF Record:**
```
Type: TXT
Name: @
Value: v=spf1 include:_spf.resend.com ~all
```

**DKIM Record:**
```
Type: TXT
Name: resend._domainkey
Value: [Provided by Resend]
```

**DMARC Record:**
```
Type: TXT
Name: _dmarc
Value: v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com
```

### 5.5 Test Email Delivery

1. Go to your deployed app
2. Start signup flow with real email
3. Verify:
   - Email arrives within 30 seconds
   - From address shows your domain
   - Links work correctly
   - Email doesn't go to spam

---

## Phase 6: Go-Live Checklist

### 6.1 Pre-Launch Checklist

#### Code & Build

- [ ] All linting errors fixed (`npm run lint`)
- [ ] Build completes successfully (`npm run build`)
- [ ] Unit tests pass (`npm test`)
- [ ] E2E tests pass (or documented exceptions)
- [ ] No console errors in production build
- [ ] Debug routes removed or protected

#### Supabase Production

- [ ] Production project created
- [ ] Database schema deployed
- [ ] RLS policies verified
- [ ] Site URL configured correctly
- [ ] Redirect URLs added (all variations)
- [ ] Email templates customized
- [ ] API settings reviewed

#### Vercel Production

- [ ] Repository connected
- [ ] Environment variables set
- [ ] Build succeeds on Vercel
- [ ] Preview URL works
- [ ] Security headers configured

#### Domain

- [ ] DNS records propagated
- [ ] SSL certificate active
- [ ] www redirect working
- [ ] Domain verified in Supabase

#### Email/SMTP

- [ ] SMTP provider configured
- [ ] DNS records for email added
- [ ] Test email received successfully
- [ ] Email doesn't go to spam
- [ ] Unsubscribe link works (if applicable)

### 6.2 Functional Testing Checklist

Perform these tests on the production URL:

#### Authentication Flow

- [ ] **Sign Up:** New user can sign pledge
- [ ] **Magic Link:** Email arrives within 30 seconds
- [ ] **Verification:** Clicking link creates profile
- [ ] **Redirect:** User lands on their profile page
- [ ] **Login:** Existing user can log in
- [ ] **Session:** Session persists on refresh

#### Core Features

- [ ] **Landing Page:** Loads correctly, all sections visible
- [ ] **Sign Pledge Form:** All fields work, validation works
- [ ] **Profile Page:** Shows correct data, shareable
- [ ] **Public Profiles:** Accessible without login
- [ ] **Certificate:** Displays and can be copied
- [ ] **Witness Feature:** Can add witnesses
- [ ] **Navigation:** All links work

#### Error Handling

- [ ] **Invalid Magic Link:** Shows helpful error
- [ ] **Profile Not Found:** 404 page works
- [ ] **Network Error:** Graceful degradation
- [ ] **Form Validation:** Clear error messages

#### Cross-Browser Testing

- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)
- [ ] Mobile Safari (iOS)
- [ ] Mobile Chrome (Android)

### 6.3 Performance Checklist

- [ ] Lighthouse score > 90 (Performance)
- [ ] First Contentful Paint < 1.5s
- [ ] Largest Contentful Paint < 2.5s
- [ ] No layout shift issues
- [ ] Images optimized

### 6.4 SEO Checklist

- [ ] Meta title and description set
- [ ] Open Graph tags configured
- [ ] Twitter Card meta tags
- [ ] Favicon present
- [ ] robots.txt configured
- [ ] sitemap.xml generated (optional)

---

## Post-Launch Monitoring

### 7.1 Monitoring Setup

#### Recommended Tools

| Tool | Purpose | Priority |
|------|---------|----------|
| **Supabase Dashboard** | Database monitoring | Essential |
| **Vercel Analytics** | Traffic & performance | High |
| **Sentry** | Error tracking | High |
| **UptimeRobot** | Uptime monitoring | High |
| **Google Analytics** | User analytics | Medium |

#### Supabase Monitoring

- **Database:** Project → Database → Metrics
- **Auth:** Project → Authentication → Logs
- **API:** Project → API → Logs

#### Key Metrics to Watch

| Metric | Warning Threshold | Action |
|--------|-------------------|--------|
| Auth errors | > 5% | Investigate immediately |
| Database connections | > 80% | Consider upgrade |
| Response time | > 500ms | Optimize queries |
| Error rate | > 1% | Review error logs |

### 7.2 First 24 Hours

- [ ] Monitor error logs every 2 hours
- [ ] Check email delivery rate
- [ ] Verify database connections stable
- [ ] Watch for auth flow issues
- [ ] Respond to user reports immediately

### 7.3 First Week

- [ ] Review all error reports
- [ ] Analyze user feedback
- [ ] Check performance metrics
- [ ] Verify no database issues
- [ ] Plan hotfixes if needed

---

## Rollback Procedures

### 8.1 Vercel Rollback

If issues detected after deployment:

1. **Go to:** Vercel Dashboard → Deployments
2. **Find:** Last known working deployment
3. **Click:** Three dots → Promote to Production
4. **Verify:** Site is working

### 8.2 Supabase Rollback

#### Schema Changes

If schema changes cause issues:

1. Identify problematic migration
2. Write reverse migration
3. Test on staging first
4. Apply to production

#### Data Issues

If data corruption occurs:

1. Stop all writes (enable maintenance mode)
2. Restore from point-in-time backup
3. Investigate root cause
4. Re-enable access

### 8.3 Emergency Contacts

| Issue Type | Action |
|------------|--------|
| Vercel Down | Check [status.vercel.com](https://status.vercel.com) |
| Supabase Down | Check [status.supabase.com](https://status.supabase.com) |
| Domain Issues | Contact registrar support |
| Email Issues | Contact SMTP provider support |

---

## Appendix A: Environment Variable Reference

### Production Environment

```bash
# Required
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Optional
VITE_ALLOW_DUPLICATE_NAMES=true
```

### Test Environment (`.env.test.local`)

```bash
# All production variables plus:
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## Appendix B: Quick Reference Commands

```bash
# Development
npm run dev                     # Start dev server

# Production Build
npm run build                   # Build for production
npm run preview                 # Preview production build locally

# Testing
npm test                        # Unit tests
npm run test:e2e                # E2E tests
npm run lint                    # Linting

# Deployment
git push origin main            # Triggers Vercel auto-deploy
```

---

## Appendix C: Supabase SQL Commands

### Verify Schema

```sql
-- Check tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public';

-- Check RLS enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public';

-- Check policies
SELECT * FROM pg_policies
WHERE schemaname = 'public';
```

### Monitor Usage

```sql
-- Count profiles
SELECT COUNT(*) FROM profiles;

-- Count witnesses
SELECT COUNT(*) FROM witnesses;

-- Recent signups
SELECT name, created_at
FROM profiles
ORDER BY created_at DESC
LIMIT 10;
```

---

**Document prepared by:** Winston (Architect Agent)
**Review required by:** Development Team
**Approval required by:** Project Owner
