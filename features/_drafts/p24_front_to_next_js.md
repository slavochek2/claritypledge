# P24: Migrate from Vite to Next.js for SEO

## Cloud Agent Instructions

**Branch:** `feature/nextjs-migration`
**Model:** Claude Opus 4.5 (use `/c claude [task]`)
**Workflow:** Use `/loop` for each checkpoint
**Time Budget:** ~4-6 hours autonomous work

### Autonomous Mode Rules

1. **Use `/loop` workflow** for each checkpoint — analyze → implement → test → visual check
2. **DO NOT use AskUserQuestion** — make reasonable decisions, pick simpler options when ambiguous
3. **Commit after each checkpoint passes** — enables rollback if later steps fail
4. **If stuck (3+ attempts):**
   - Analyze root cause
   - Write analysis to `docs/migration-blockers.md`
   - Revert to last working checkpoint
   - Try alternative approach
   - If still stuck, document and move to next checkpoint
5. **Use Playwright MCP** for visual SSR verification (dev server runs on localhost:3000 for Next.js)
6. **TDD approach** — write verification test FIRST, then implement until it passes

### Environment Variables (Test Database)

Create `.env.local` in the Next.js project root:

```env
NEXT_PUBLIC_SUPABASE_URL=https://gfjctyxqlwexxwsmkakq.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdmamN0eXhxbHdleHh3c21rYWtxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNDIwMTAsImV4cCI6MjA3OTcxODAxMH0.Dcw1ReGeAz20Pkp5hDIfr4tMki42yauh-5DGlRqlMJE
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdmamN0eXhxbHdleHh3c21rYWtxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDE0MjAxMCwiZXhwIjoyMDc5NzE4MDEwfQ.TSI6AaNdelfX1Xc7OpLvWY_j1r63BPi8GjV6q0zsu6w
```

---

## Problem

React SPA (Vite) renders client-side only. This hurts SEO:
- Google may not wait for JS to execute
- No server-rendered meta tags per page
- Social media previews show blank/generic content
- Core Web Vitals suffer from slower First Contentful Paint

## Solution

Migrate to Next.js App Router. Keep React — Next.js *is* React with a server layer.

---

## Migration Checkpoints (TDD Style)

Each checkpoint follows this pattern:
1. Write verification test
2. Implement until test passes
3. Visual check with Playwright MCP (if UI involved)
4. Commit with message: `checkpoint-N: [description]`

---

### Checkpoint 0: Pre-Migration Cleanup (CRITICAL)

**Goal:** Prepare codebase for Next.js — resolve naming conflicts and update env vars

**This checkpoint has NO test** — it's structural preparation.

**Implementation Tasks:**

1. **Rename existing `src/app/` to avoid Next.js App Router conflict:**
   ```bash
   # Next.js App Router REQUIRES src/app/ for routing
   # Current src/app/ has pages/, components/, data/ — rename to src/features/
   mv src/app src/features
   ```

2. **Update ALL imports referencing `src/app/`:**
   ```bash
   # Find all files importing from @/app/ or src/app/
   grep -r "from ['\"]@/app" src/
   grep -r "from ['\"].*src/app" src/

   # Replace @/app → @/features in all files
   # Replace src/app → src/features in all files
   ```

3. **Update path aliases in `tsconfig.json`:**
   ```json
   {
     "paths": {
       "@/*": ["./src/*"],
       "@features/*": ["./src/features/*"],
       "@components/*": ["./src/components/*"],
       "@lib/*": ["./src/lib/*"]
     }
   }
   ```

4. **Global replace `import.meta.env.VITE_` → `process.env.NEXT_PUBLIC_`:**
   ```bash
   # Find all occurrences
   grep -r "import.meta.env.VITE_" src/

   # Files that likely need updates:
   # - src/lib/supabase.ts
   # - src/lib/mixpanel.ts
   # - src/main.tsx (will be removed, but check first)
   # - Any component checking env vars

   # Replace pattern:
   # import.meta.env.VITE_SUPABASE_URL → process.env.NEXT_PUBLIC_SUPABASE_URL
   # import.meta.env.VITE_SUPABASE_ANON_KEY → process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
   # import.meta.env.VITE_SENTRY_DSN → process.env.NEXT_PUBLIC_SENTRY_DSN
   # import.meta.env.PROD → process.env.NODE_ENV === 'production'
   ```

5. **Remove PWA / Service Worker code:**
   ```bash
   # Check src/main.tsx for registerSW() or service worker registration
   # Remove any PWA-related imports and initialization
   # Remove vite-plugin-pwa references
   ```

6. **Update Tailwind config for Next.js paths:**

   Edit `tailwind.config.js`:
   ```javascript
   module.exports = {
     content: [
       './src/app/**/*.{js,ts,jsx,tsx,mdx}',      // Next.js App Router
       './src/features/**/*.{js,ts,jsx,tsx,mdx}', // Renamed from src/app
       './src/components/**/*.{js,ts,jsx,tsx,mdx}',
       './src/auth/**/*.{js,ts,jsx,tsx,mdx}',
       './src/hooks/**/*.{js,ts,jsx,tsx,mdx}',
     ],
     // ... rest of existing config
   }
   ```

7. **Create test profile in database for Checkpoint 3:**
   ```typescript
   // Run this via Supabase SQL editor or create a seed script
   // Using service role key for direct insert

   INSERT INTO profiles (id, slug, name, email, is_verified, signed_at)
   VALUES (
     'a0000000-0000-0000-0000-000000000001',
     'test-user',
     'Test User',
     'test@claritypledge.com',
     true,
     NOW()
   )
   ON CONFLICT (slug) DO NOTHING;
   ```

**Commit:** `checkpoint-0: Pre-migration cleanup - rename src/app to src/features, update env vars`

---

### Checkpoint 1: Next.js Foundation

**Goal:** Next.js builds and runs with Supabase SSR client configured

**Verification Test:** Create `__tests__/checkpoint-1.test.ts`
```typescript
import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';

describe('Checkpoint 1: Next.js Foundation', () => {
  it('next build succeeds', () => {
    expect(() => execSync('npm run build', { stdio: 'pipe' })).not.toThrow();
  });

  it('supabase server client can be imported', async () => {
    const { createClient } = await import('@/lib/supabase/server');
    expect(typeof createClient).toBe('function');
  });

  it('supabase browser client can be imported', async () => {
    const { createClient } = await import('@/lib/supabase/client');
    expect(typeof createClient).toBe('function');
  });
});
```

**Implementation Tasks:**

1. **Initialize Next.js project structure** (in project root, not subdirectory)
   ```bash
   # Remove Vite config
   rm vite.config.ts

   # Install Next.js dependencies
   npm install next@14 @supabase/ssr
   npm uninstall vite @vitejs/plugin-react vite-plugin-pwa
   ```

2. **Create Next.js config:** `next.config.js`
   ```javascript
   /** @type {import('next').NextConfig} */
   const nextConfig = {
     reactStrictMode: true,
     // Preserve existing path aliases
     experimental: {
       typedRoutes: true,
     },
   };
   module.exports = nextConfig;
   ```

3. **Update `tsconfig.json`** for Next.js paths:
   ```json
   {
     "compilerOptions": {
       "target": "ES2017",
       "lib": ["dom", "dom.iterable", "esnext"],
       "allowJs": true,
       "skipLibCheck": true,
       "strict": true,
       "noEmit": true,
       "esModuleInterop": true,
       "module": "esnext",
       "moduleResolution": "bundler",
       "resolveJsonModule": true,
       "isolatedModules": true,
       "jsx": "preserve",
       "incremental": true,
       "plugins": [{ "name": "next" }],
       "paths": {
         "@/*": ["./src/*"],
         "@components/*": ["./src/components/*"],
         "@lib/*": ["./src/lib/*"]
       }
     },
     "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
     "exclude": ["node_modules"]
   }
   ```

4. **Create Supabase SSR utilities:**

   `src/lib/supabase/client.ts` (browser client):
   ```typescript
   import { createBrowserClient } from '@supabase/ssr';

   export function createClient() {
     return createBrowserClient(
       process.env.NEXT_PUBLIC_SUPABASE_URL!,
       process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
     );
   }
   ```

   `src/lib/supabase/server.ts` (server client):
   ```typescript
   import { createServerClient } from '@supabase/ssr';
   import { cookies } from 'next/headers';

   export async function createClient() {
     const cookieStore = await cookies();

     return createServerClient(
       process.env.NEXT_PUBLIC_SUPABASE_URL!,
       process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
       {
         cookies: {
           getAll() {
             return cookieStore.getAll();
           },
           setAll(cookiesToSet) {
             try {
               cookiesToSet.forEach(({ name, value, options }) =>
                 cookieStore.set(name, value, options)
               );
             } catch {
               // Called from Server Component - ignore
             }
           },
         },
       }
     );
   }
   ```

5. **Create middleware:** `src/middleware.ts`
   ```typescript
   import { createServerClient } from '@supabase/ssr';
   import { NextResponse, type NextRequest } from 'next/server';

   export async function middleware(request: NextRequest) {
     let supabaseResponse = NextResponse.next({ request });

     const supabase = createServerClient(
       process.env.NEXT_PUBLIC_SUPABASE_URL!,
       process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
       {
         cookies: {
           getAll() {
             return request.cookies.getAll();
           },
           setAll(cookiesToSet) {
             cookiesToSet.forEach(({ name, value }) =>
               request.cookies.set(name, value)
             );
             supabaseResponse = NextResponse.next({ request });
             cookiesToSet.forEach(({ name, value, options }) =>
               supabaseResponse.cookies.set(name, value, options)
             );
           },
         },
       }
     );

     // Refresh session if expired
     await supabase.auth.getUser();

     return supabaseResponse;
   }

   export const config = {
     matcher: [
       '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
     ],
   };
   ```

6. **Update `package.json` scripts:**
   ```json
   {
     "scripts": {
       "dev": "next dev --port 3000",
       "build": "next build",
       "start": "next start",
       "lint": "next lint",
       "test": "vitest",
       "test:e2e": "playwright test"
     }
   }
   ```

7. **Create basic app structure:**
   - `src/app/layout.tsx` — Root layout with providers
   - `src/app/page.tsx` — Landing page (placeholder)

**Commit:** `checkpoint-1: Next.js foundation with Supabase SSR`

---

### Checkpoint 2: Landing Page SSR

**Goal:** Landing page renders HTML server-side (visible in view-source)

**Verification Test:** Create `__tests__/checkpoint-2.test.ts`
```typescript
import { describe, it, expect } from 'vitest';

describe('Checkpoint 2: Landing Page SSR', () => {
  it('landing page HTML contains "Clarity Pledge" in source', async () => {
    // This runs against the dev server
    const response = await fetch('http://localhost:3000');
    const html = await response.text();
    expect(html).toContain('Clarity Pledge');
    expect(html).toContain('Sign the Pledge');
  });

  it('landing page has proper meta tags', async () => {
    const response = await fetch('http://localhost:3000');
    const html = await response.text();
    expect(html).toContain('<title>');
    expect(html).toContain('og:title');
  });
});
```

**Playwright MCP Visual Check:**
```
1. Navigate to http://localhost:3000
2. Take screenshot (desktop)
3. Verify: Hero section visible, "Sign the Pledge" button, navigation
4. Check console for errors
```

**Implementation Tasks:**

1. **Create root layout:** `src/app/layout.tsx`
   ```typescript
   import type { Metadata } from 'next';
   import '@/index.css';

   export const metadata: Metadata = {
     title: 'Clarity Pledge - Commit to Clear Communication',
     description: 'Join professionals who pledge to communicate clearly.',
     openGraph: {
       title: 'Clarity Pledge',
       description: 'Join professionals who pledge to communicate clearly.',
       type: 'website',
     },
   };

   export default function RootLayout({
     children,
   }: {
     children: React.ReactNode;
   }) {
     return (
       <html lang="en">
         <body>{children}</body>
       </html>
     );
   }
   ```

2. **Migrate landing page:** `src/app/page.tsx`
   - Import existing landing sections from `src/app/components/landing/`
   - Static sections can be Server Components (no "use client")
   - Interactive sections (FAQ accordion, etc.) need "use client"
   - Keep layout wrapper from `src/app/layouts/clarity-landing-layout.tsx`

3. **Add "use client" to interactive components:**
   - `src/app/components/landing/faq-section.tsx` (Accordion)
   - Any component with onClick, useState, useEffect

**Commit:** `checkpoint-2: Landing page with SSR`

---

### Checkpoint 3: Profile Pages with Dynamic SSR

**Goal:** Profile pages render with dynamic data server-side, unique meta tags per profile

**Verification Test:** Create `__tests__/checkpoint-3.test.ts`
```typescript
import { describe, it, expect } from 'vitest';

describe('Checkpoint 3: Profile SSR', () => {
  it('profile page renders user name in HTML source', async () => {
    // Use a known test profile slug
    const response = await fetch('http://localhost:3000/p/test-user');
    const html = await response.text();
    // Should contain profile data in initial HTML
    expect(html).toMatch(/Test User|profile/i);
  });

  it('profile page has dynamic og:title meta tag', async () => {
    const response = await fetch('http://localhost:3000/p/test-user');
    const html = await response.text();
    expect(html).toContain('og:title');
  });
});
```

**Implementation Tasks:**

1. **Create profile route:** `src/app/p/[slug]/page.tsx`
   ```typescript
   import { createClient } from '@/lib/supabase/server';
   import { notFound } from 'next/navigation';
   import { ProfilePageClient } from './profile-page-client';
   import type { Metadata } from 'next';

   interface Props {
     params: Promise<{ slug: string }>;
   }

   export async function generateMetadata({ params }: Props): Promise<Metadata> {
     const { slug } = await params;
     const supabase = await createClient();
     const { data: profile } = await supabase
       .from('profiles')
       .select('name, role, reason')
       .eq('slug', slug)
       .single();

     if (!profile) {
       return { title: 'Profile Not Found' };
     }

     return {
       title: `${profile.name} - Clarity Pledge`,
       description: profile.reason || `${profile.name} has signed the Clarity Pledge`,
       openGraph: {
         title: `${profile.name} signed the Clarity Pledge`,
         description: profile.reason || 'Join the movement for clear communication',
       },
     };
   }

   export default async function ProfilePage({ params }: Props) {
     const { slug } = await params;
     const supabase = await createClient();

     const { data: profile, error } = await supabase
       .from('profiles')
       .select('*')
       .eq('slug', slug)
       .single();

     if (error || !profile) {
       notFound();
     }

     // Fetch witnesses separately (Supabase PostgREST limitation)
     const { data: witnesses } = await supabase
       .from('witnesses')
       .select('*')
       .eq('profile_id', profile.id);

     return (
       <ProfilePageClient
         profile={{ ...profile, witnesses: witnesses || [] }}
       />
     );
   }
   ```

2. **Create client component:** `src/app/p/[slug]/profile-page-client.tsx`
   ```typescript
   'use client';

   // Move existing ProfilePage component logic here
   // Import from src/app/components/profile/*
   ```

3. **Ensure test profile exists in database** (the cloud agent can create one via Supabase)

**Commit:** `checkpoint-3: Profile pages with dynamic SSR and meta tags`

---

### Checkpoint 4: Static Pages (About, Champions)

**Goal:** About and Champions pages render server-side

**Verification Test:** Create `__tests__/checkpoint-4.test.ts`
```typescript
import { describe, it, expect } from 'vitest';

describe('Checkpoint 4: Static Pages SSR', () => {
  it('about page renders in HTML', async () => {
    const response = await fetch('http://localhost:3000/about');
    const html = await response.text();
    expect(html).toContain('About');
  });

  it('understanding-champions page renders profiles', async () => {
    const response = await fetch('http://localhost:3000/understanding-champions');
    const html = await response.text();
    expect(html).toContain('Champions');
  });
});
```

**Implementation Tasks:**

1. **Create about page:** `src/app/about/page.tsx`
   - Mostly static content (Server Component)
   - Contact form needs "use client"

2. **Create champions page:** `src/app/understanding-champions/page.tsx`
   - Fetch profiles server-side
   - Pass to client component for interactivity

3. **Set up redirects in `next.config.js`:**
   ```javascript
   async redirects() {
     return [
       {
         source: '/clarity-champions',
         destination: '/understanding-champions',
         permanent: true,
       },
     ];
   }
   ```

**Commit:** `checkpoint-4: Static pages with SSR`

---

### Checkpoint 5: Auth Flow (Critical)

**Goal:** Magic link auth flow works end-to-end

**Verification Test:** Create `__tests__/checkpoint-5.test.ts`
```typescript
import { describe, it, expect } from 'vitest';

describe('Checkpoint 5: Auth Flow', () => {
  it('sign-pledge page loads', async () => {
    const response = await fetch('http://localhost:3000/sign-pledge');
    expect(response.status).toBe(200);
  });

  it('auth callback route exists', async () => {
    // Should redirect or show error (no valid session), but not 404
    const response = await fetch('http://localhost:3000/auth/callback', {
      redirect: 'manual'
    });
    expect(response.status).not.toBe(404);
  });
});
```

**Implementation Tasks:**

1. **Create auth callback route handler:** `src/app/auth/callback/route.ts`
   ```typescript
   import { createClient } from '@/lib/supabase/server';
   import { NextResponse } from 'next/server';

   export async function GET(request: Request) {
     const { searchParams, origin } = new URL(request.url);
     const code = searchParams.get('code');
     const next = searchParams.get('next') ?? '/';

     if (code) {
       const supabase = await createClient();
       const { error } = await supabase.auth.exchangeCodeForSession(code);

       if (!error) {
         // Redirect to callback page for profile creation
         return NextResponse.redirect(`${origin}/auth/callback/complete`);
       }
     }

     // Auth error - redirect to sign-pledge with error
     return NextResponse.redirect(`${origin}/sign-pledge?error=auth_failed`);
   }
   ```

2. **Create callback completion page:** `src/app/auth/callback/complete/page.tsx`
   - This is where profile creation happens (like current AuthCallbackPage.tsx)
   - **CRITICAL:** Preserve slug generation and conflict resolution logic
   - Must handle both new users and returning users

3. **Migrate sign-pledge page:** `src/app/sign-pledge/page.tsx`
   - Client component (form handling)
   - Update API calls to use new Supabase client

4. **Create AuthProvider for client components:** `src/app/providers.tsx`
   ```typescript
   'use client';

   import { AuthProvider } from '@/auth';
   import { useEffect } from 'react';

   // Initialize observability tools (production only)
   function ObservabilityInit() {
     useEffect(() => {
       if (process.env.NODE_ENV === 'production') {
         // Sentry
         import('@sentry/react').then((Sentry) => {
           Sentry.init({
             dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
             environment: 'production',
           });
         });

         // Mixpanel (already initialized via script tag in layout, but ensure identify works)
       }
     }, []);
     return null;
   }

   export function Providers({ children }: { children: React.ReactNode }) {
     return (
       <AuthProvider>
         <ObservabilityInit />
         {children}
       </AuthProvider>
     );
   }
   ```

5. **Update root layout to include providers:**
   ```typescript
   import { Providers } from './providers';

   export default function RootLayout({ children }) {
     return (
       <html>
         <body>
           <Providers>{children}</Providers>
         </body>
       </html>
     );
   }
   ```

6. **CRITICAL: Update `src/auth/AuthContext.tsx` to use new Supabase client:**
   ```typescript
   // Change this import:
   // import { supabase } from '@/lib/supabase';

   // To this:
   import { createClient } from '@/lib/supabase/client';

   // Then inside the component, create client:
   const supabase = createClient();

   // The onAuthStateChange and getSession calls should work the same way
   // with the new browser client from @supabase/ssr
   ```

7. **Update `src/features/data/api.ts` to use new client:**
   ```typescript
   // Change this import:
   // import { supabase } from '@/lib/supabase';

   // To this:
   import { createClient } from '@/lib/supabase/client';

   // Create client at module level or per-function as needed
   const supabase = createClient();
   ```

**Commit:** `checkpoint-5: Auth flow with magic link`

---

### Checkpoint 6: Remaining Client Pages

**Goal:** All remaining routes work (settings, demo, chat, etc.)

**Verification Test:** Create `__tests__/checkpoint-6.test.ts`
```typescript
import { describe, it, expect } from 'vitest';

describe('Checkpoint 6: Client Pages', () => {
  const clientPages = [
    '/sign-pledge',
    '/settings',
    '/demo',
    '/chat',
    '/feed',
    '/privacy-policy',
    '/terms-of-service',
  ];

  clientPages.forEach(page => {
    it(`${page} returns 200`, async () => {
      const response = await fetch(`http://localhost:3000${page}`);
      // Some pages may redirect, that's OK (not 404/500)
      expect([200, 302, 307]).toContain(response.status);
    });
  });
});
```

**Implementation Tasks:**

1. **Create route structure for all pages:**
   ```
   src/app/
   ├── sign-pledge/
   │   └── page.tsx (client)
   ├── sign-pledge/confirm/
   │   └── page.tsx (client)
   ├── settings/
   │   └── page.tsx (client, protected)
   ├── demo/
   │   └── page.tsx (client)
   ├── chat/
   │   └── page.tsx (client)
   ├── live/[code]/
   │   └── page.tsx (client)
   ├── feed/
   │   └── page.tsx (client)
   ├── idea/[id]/
   │   └── page.tsx (client)
   ├── privacy-policy/
   │   └── page.tsx (static)
   ├── terms-of-service/
   │   └── page.tsx (static)
   ├── manifesto/
   │   └── page.tsx (static)
   └── article/
       └── page.tsx (static)
   ```

2. **For each client page:**
   - Add `"use client"` directive
   - Import existing page component
   - Wrap with layout if needed

3. **Handle protected routes:**
   - Settings page checks auth in middleware OR client-side redirect

**Commit:** `checkpoint-6: All client pages migrated`

---

### Checkpoint 7: Final Verification

**Goal:** Full app works with no regressions

**Verification Test:** Create `__tests__/checkpoint-7.test.ts`
```typescript
import { describe, it, expect } from 'vitest';

describe('Checkpoint 7: Full App Verification', () => {
  it('build succeeds with no errors', () => {
    const result = execSync('npm run build 2>&1', { encoding: 'utf8' });
    expect(result).not.toContain('Error');
  });

  it('no TypeScript errors', () => {
    const result = execSync('npx tsc --noEmit 2>&1', { encoding: 'utf8' });
    expect(result).toBe('');
  });

  it('lint passes', () => {
    expect(() => execSync('npm run lint', { stdio: 'pipe' })).not.toThrow();
  });
});
```

**Playwright MCP Full Visual Check:**
```
1. Landing page (desktop + mobile)
2. Profile page with real data
3. About page
4. Champions page
5. Sign pledge form
6. Check all navigation links work
```

**Implementation Tasks:**

1. **Run full test suite:** `npm test`
2. **Run E2E tests:** `npm run test:e2e` (adapt if needed)
3. **Fix any remaining TypeScript errors**
4. **Remove old Vite files if not already removed:**
   - `vite.config.ts`
   - `vite-env.d.ts`
   - Any `import.meta.env.VITE_*` references

**Commit:** `checkpoint-7: Migration complete - all tests passing`

---

## File Mapping Reference

| Vite Location | Next.js Location |
|---------------|------------------|
| `src/main.tsx` | `src/app/layout.tsx` + `src/app/providers.tsx` |
| `src/App.tsx` | File-based routing in `src/app/` |
| `src/lib/supabase.ts` | `src/lib/supabase/client.ts` + `server.ts` |
| `src/app/` (old) | `src/features/` (renamed to avoid conflict) |
| `src/app/pages/*.tsx` (old) | `src/features/pages/*.tsx` (components) |
| `src/auth/AuthCallbackPage.tsx` | `src/app/auth/callback/complete/page.tsx` |
| `index.html` | `src/app/layout.tsx` (metadata) |
| `vite.config.ts` | `next.config.js` |
| `VITE_*` env vars | `NEXT_PUBLIC_*` env vars |
| `import.meta.env.PROD` | `process.env.NODE_ENV === 'production'` |

### Directory Structure After Migration

```
src/
├── app/                    # NEW: Next.js App Router (routes)
│   ├── layout.tsx          # Root layout
│   ├── providers.tsx       # Client providers (Auth, Observability)
│   ├── page.tsx            # Landing page
│   ├── about/page.tsx
│   ├── p/[slug]/page.tsx   # Profile pages
│   ├── auth/callback/      # Auth flow
│   └── ...
├── features/               # RENAMED from src/app (application code)
│   ├── components/         # Feature components
│   ├── data/               # API layer (api.ts)
│   ├── pages/              # Page components (imported by routes)
│   └── types/
├── auth/                   # Auth module (unchanged)
├── components/ui/          # Base UI (unchanged)
├── hooks/                  # Custom hooks (unchanged)
└── lib/
    ├── supabase/
    │   ├── client.ts       # Browser client (@supabase/ssr)
    │   └── server.ts       # Server client (@supabase/ssr)
    ├── mixpanel.ts
    └── utils.ts
```

## Components That Need "use client"

**All of these (in `src/features/` after rename, add directive):**
- All page components with hooks
- `src/features/components/layout/simple-navigation.tsx`
- `src/features/components/pledge/*` (forms)
- `src/features/components/profile/*` (interactive views)
- `src/features/components/partners/*` (live/demo/chat)
- `src/features/components/feed/*` (voting)
- `src/features/components/social/*` (witness interactions)
- `src/components/ui/*` (Radix primitives)
- `src/auth/AuthContext.tsx`
- All custom hooks in `src/hooks/`

**Note:** After Checkpoint 0, all `@/app/` imports become `@/features/`.

## Critical Gotchas

1. **Profile routes use SLUG not UUID** — `/p/john-doe` not `/p/uuid`
2. **Profile creation ONLY in auth callback** — never move this logic
3. **Witness RLS allows any authenticated user** — by design
4. **Supabase clients differ** — browser vs server
5. **Middleware refreshes auth tokens** — essential for SSR

## Success Criteria

- [ ] `npm run build` succeeds
- [ ] `npx next lint` passes (Next.js-specific lint rules)
- [ ] `npx tsc --noEmit` passes (no TypeScript errors)
- [ ] Landing page HTML shows content in view-source (curl localhost:3000 | grep "Clarity Pledge")
- [ ] Profile pages have unique meta tags per user
- [ ] Magic link auth flow works end-to-end
- [ ] All routes return 200 (or appropriate redirect)
- [ ] Unit tests pass (`npm test`)
- [ ] Visual check shows no regressions (Playwright MCP)
- [ ] No `import.meta.env` references remain in codebase
- [ ] Old `src/app/` directory renamed to `src/features/`

## Rollback Plan

If migration fails catastrophically:
1. `git checkout main` — return to Vite version
2. Document what broke in `docs/migration-blockers.md`
3. The branch `feature/nextjs-migration` preserves partial progress

---

## Sources

- [Supabase SSR for Next.js](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [Creating Supabase Client for SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [Next.js App Router with Supabase Auth](https://supabase.com/docs/guides/auth/auth-helpers/nextjs)
