# P24: Incremental Next.js Migration for SEO (Landing + Public Pages Only)

## Cloud Agent Instructions

**Branch:** `feature/nextjs-seo-incremental`
**Model:** Claude Opus 4.5 (use `/c claude [task]`)
**Workflow:** Use `/loop` for EACH checkpoint — analyze → implement → test → visual check → commit
**Time Budget:** ~2-3 hours autonomous work (4 checkpoints × 30-45 min each)

### Autonomous Mode Rules

1. **Use `/loop` workflow** for each checkpoint — full cycle every time
2. **DO NOT use AskUserQuestion** — make reasonable decisions, pick simpler options when ambiguous
3. **Commit after EACH checkpoint passes** — enables rollback if later steps fail
4. **If stuck (3+ attempts on one checkpoint):**
   - Document blocker in `docs/technical/migration-blockers.md`
   - Revert to last working checkpoint (`git reset --hard checkpoint-N`)
   - Try alternative approach
   - If still stuck after 2 alternatives, STOP and notify user
5. **Use Playwright MCP** for visual SSR verification
6. **TDD approach** — write verification test FIRST, then implement until it passes

### Three-Tier Boundaries

✅ **Always do:**
- Run tests after changes
- Commit after each completed checkpoint with message: `checkpoint-N: [description]`
- Use Playwright MCP for visual verification
- Check both desktop (1280px) and mobile (375px) views
- Verify no console errors in browser
- Follow existing patterns from codebase

⚠️ **Ask first (STOP and document, don't proceed):**
- If build fails 3 times in a row
- If tests fail after implementation
- If Playwright screenshots show broken layout
- If you encounter unexpected Supabase schema differences

🚫 **Never do:**
- Delete or comment out failing tests
- Skip visual verification steps
- Proceed if previous checkpoint test fails
- Modify database schema
- Change existing `/app/*` routes (we're NOT migrating those yet)
- Remove Vite config or dependencies

---

## Problem

React SPA (Vite) renders client-side only. This hurts SEO:
- Google may not wait for JS to execute
- No server-rendered meta tags per page
- Social media previews show blank/generic content
- Core Web Vitals suffer from slower First Contentful Paint

## Solution

**Incremental hybrid approach** — Keep what works, migrate only what needs SEO:

| Route | Migration Status | Why |
|-------|------------------|-----|
| `/` (landing) | ✅ Migrate | Most traffic, biggest SEO impact |
| `/manifesto` | ✅ Migrate | High-value content page |
| `/about` | ✅ Migrate | Second-most crawled |
| `/p/:slug` | ✅ Migrate | Unique meta tags = social sharing wins |
| `/live`, `/chat`, `/demo`, `/settings` | ❌ Keep as SPA | Behind auth, no SEO benefit, high complexity |

**Architecture:** Next.js App Router for public pages, Vite SPA bundle served at `/app/*` for authenticated features.

---

## Success Criteria

- [ ] `npm run build` succeeds
- [ ] Landing page HTML shows content in view-source (`curl localhost:3000 | grep "Clarity Pledge"`)
- [ ] Profile pages have unique meta tags per user (check view-source)
- [ ] All public pages render server-side (no loading flicker)
- [ ] Authenticated app routes (`/live`, `/chat`) still work as SPA
- [ ] Unit tests pass (`npm test`)
- [ ] Visual check shows no regressions (Playwright MCP)
- [ ] No TypeScript errors (`npx tsc --noEmit`)

---

## Migration Checkpoints (TDD Style)

Each checkpoint follows this pattern:
1. **Write verification test FIRST**
2. **Implement until test passes**
3. **Visual check with Playwright MCP** (if UI involved)
4. **Commit:** `checkpoint-N: [description]`
5. **Run `/loop`** to ensure full cycle completes

---

### Checkpoint 0: Pre-Flight Checklist

**Goal:** Verify environment and test database before starting migration

**This checkpoint has NO code changes** — just verification.

**Tasks:**

1. **Verify test database connection:**
   ```bash
   # Test database credentials from CLAUDE.md
   curl "https://gfjctyxqlwexxwsmkakq.supabase.co/rest/v1/" \
     -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

   # Should return: {"message":"Welcome to PostgREST"}
   ```

2. **Create test profile for Checkpoint 3:**
   ```sql
   -- Run via Supabase SQL editor OR via service role client
   INSERT INTO profiles (id, slug, name, email, is_verified, signed_at)
   VALUES (
     'a0000000-0000-0000-0000-000000000001',
     'test-user-nextjs',
     'Test User NextJS',
     'test-nextjs@claritypledge.com',
     true,
     NOW()
   )
   ON CONFLICT (slug) DO NOTHING;
   ```

3. **Verify existing build works:**
   ```bash
   npm run build
   npm run preview
   # Visit http://localhost:4173 — should see landing page
   ```

4. **Verify Playwright MCP available:**
   ```bash
   # Use Playwright MCP tool to navigate to localhost:5173
   # Take screenshot of landing page
   # Verify hero section visible
   ```

**Done when:**
- [ ] Test database responds
- [ ] Test profile exists (slug: `test-user-nextjs`)
- [ ] Current Vite build succeeds
- [ ] Playwright MCP can take screenshots

**Commit:** `checkpoint-0: Pre-flight checks passed`

---

### Checkpoint 1: Hybrid Architecture Setup

**Goal:** Next.js serves `/`, Vite SPA serves everything else

**Verification Test:** Create `__tests__/checkpoint-1.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';

describe('Checkpoint 1: Hybrid Architecture', () => {
  it('next build succeeds', () => {
    expect(() => execSync('npm run build:next', { stdio: 'pipe' })).not.toThrow();
  });

  it('vite build succeeds', () => {
    expect(() => execSync('npm run build:vite', { stdio: 'pipe' })).not.toThrow();
  });

  it('next dev server starts on port 3000', async () => {
    // This will be manually verified via Playwright MCP
    expect(true).toBe(true);
  });
});
```

**Implementation Tasks:**

1. **Install Next.js dependencies:**
   ```bash
   npm install next@14.2.4 @supabase/ssr
   # DO NOT uninstall Vite yet
   ```

2. **Create Next.js config:** `next.config.js`
   ```javascript
   /** @type {import('next').NextConfig} */
   const nextConfig = {
     reactStrictMode: true,
     // Output standalone for easier deployment
     output: 'standalone',

     // Rewrites: Everything not handled by Next.js → Vite SPA
     async rewrites() {
       return {
         fallback: [
           {
             source: '/app/:path*',
             destination: 'http://localhost:5173/app/:path*', // Vite dev server
           },
         ],
       };
     },
   };
   module.exports = nextConfig;
   ```

3. **Update `package.json` scripts:**
   ```json
   {
     "scripts": {
       "dev": "next dev --port 3000",
       "dev:vite": "vite --port 5173",
       "dev:all": "concurrently \"npm run dev\" \"npm run dev:vite\"",
       "build": "npm run build:next && npm run build:vite",
       "build:next": "next build",
       "build:vite": "vite build --outDir dist-vite",
       "start": "next start",
       "lint": "next lint",
       "test": "vitest",
       "test:e2e": "playwright test"
     }
   }
   ```

4. **Install concurrently for parallel dev servers:**
   ```bash
   npm install --save-dev concurrently
   ```

5. **Update `tsconfig.json` for Next.js:**
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

6. **Create basic Next.js app structure:**

   `src/app/layout.tsx`:
   ```typescript
   import type { Metadata } from 'next';
   import '@/index.css';

   export const metadata: Metadata = {
     title: 'Clarity Pledge - Commit to Clear Communication',
     description: 'Join professionals who pledge to communicate clearly.',
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

   `src/app/page.tsx`:
   ```typescript
   export default function LandingPage() {
     return (
       <div className="min-h-screen flex items-center justify-center">
         <h1 className="text-4xl font-bold">Next.js Landing (Placeholder)</h1>
       </div>
     );
   }
   ```

7. **Create Supabase SSR client utilities:**

   `src/lib/supabase/server.ts`:
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
               // Server Component - ignore
             }
           },
         },
       }
     );
   }
   ```

   `src/lib/supabase/client.ts` (keep existing, add SSR version):
   ```typescript
   import { createBrowserClient } from '@supabase/ssr';

   export function createClient() {
     return createBrowserClient(
       process.env.NEXT_PUBLIC_SUPABASE_URL!,
       process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
     );
   }
   ```

8. **Update `.env.local` with Next.js format:**
   ```bash
   # Keep existing VITE_ vars for Vite SPA
   VITE_SUPABASE_URL=https://gfjctyxqlwexxwsmkakq.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

   # Add NEXT_PUBLIC_ vars for Next.js SSR
   NEXT_PUBLIC_SUPABASE_URL=https://gfjctyxqlwexxwsmkakq.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

**Playwright MCP Visual Check:**
```
1. Start dev server: npm run dev
2. Navigate to http://localhost:3000
3. Take screenshot (desktop 1280px)
4. Verify: Placeholder text visible ("Next.js Landing")
5. Check console for errors (should be none)
```

**Done when:**
- [ ] `npm run build:next` succeeds
- [ ] `npm run build:vite` succeeds
- [ ] `npm run dev` starts Next.js on port 3000
- [ ] Placeholder page visible at `http://localhost:3000`
- [ ] No console errors
- [ ] Test passes

**Commit:** `checkpoint-1: Hybrid Next.js + Vite architecture with placeholder landing`

---

### Checkpoint 2: Landing Page SSR

**Goal:** Landing page renders HTML server-side with full content

**Verification Test:** Create `__tests__/checkpoint-2.test.ts`

```typescript
import { describe, it, expect } from 'vitest';

describe('Checkpoint 2: Landing Page SSR', () => {
  it('landing page HTML contains "Clarity Pledge" in source', async () => {
    const response = await fetch('http://localhost:3000');
    const html = await response.text();

    // Server-rendered content should be in HTML source
    expect(html).toContain('Clarity Pledge');
    expect(html).toContain('Sign the Pledge');
    expect(html).not.toContain('Loading...'); // No loading states
  });

  it('landing page has proper meta tags', async () => {
    const response = await fetch('http://localhost:3000');
    const html = await response.text();

    expect(html).toContain('<title>');
    expect(html).toContain('Clarity Pledge');
    expect(html).toContain('og:title');
  });

  it('landing page renders without JavaScript (SSR check)', async () => {
    const response = await fetch('http://localhost:3000');
    const html = await response.text();

    // Hero section should be in initial HTML
    expect(html).toMatch(/hero|banner|header/i);
  });
});
```

**Implementation Tasks:**

1. **Convert landing page to Server Component:** `src/app/page.tsx`
   ```typescript
   import { ClarityPledgeLanding } from '@/app/pages/clarity-pledge-landing';

   export default function LandingPage() {
     return <ClarityPledgeLanding />;
   }
   ```

2. **Mark interactive sections as Client Components:**

   Find components in [src/app/components/landing/](src/app/components/landing/) that use:
   - `useState`, `useEffect`, `useCallback`
   - `onClick`, `onChange` handlers
   - Third-party hooks

   Add `"use client"` directive to these files:
   - `faq-section.tsx` (Accordion uses state)
   - Any component with `<Link>` from react-router (needs conversion)

3. **Convert navigation links:**

   Replace `react-router-dom` Links with Next.js Links:
   ```typescript
   // Before:
   import { Link } from 'react-router-dom';

   // After:
   import Link from 'next/link';
   ```

   Note: Next.js `<Link>` doesn't need `to` prop, use `href` instead.

4. **Handle Helmet for meta tags:**

   Replace `react-helmet-async` with Next.js metadata:
   ```typescript
   // In src/app/layout.tsx
   export const metadata: Metadata = {
     title: 'Clarity Pledge - Commit to Clear Communication',
     description: 'Join professionals worldwide who pledge to communicate with clarity and understanding.',
     openGraph: {
       title: 'Clarity Pledge',
       description: 'Join the movement for clear communication',
       type: 'website',
       images: [
         {
           url: '/og-image.png',
           width: 1200,
           height: 630,
         },
       ],
     },
     twitter: {
       card: 'summary_large_image',
       title: 'Clarity Pledge',
       description: 'Join the movement for clear communication',
     },
   };
   ```

**Playwright MCP Visual Check:**
```
1. Navigate to http://localhost:3000
2. Take screenshot (desktop 1280px)
3. Take screenshot (mobile 375px)
4. Verify: Hero section, features, CTA button, footer all visible
5. View page source (curl http://localhost:3000)
6. Verify: "Clarity Pledge" appears in HTML (not just after JS loads)
7. Check console for errors (should be none)
```

**Done when:**
- [ ] Landing page renders full content server-side
- [ ] View-source shows "Clarity Pledge" in HTML
- [ ] No "Loading..." flicker on page load
- [ ] Navigation links work
- [ ] Mobile view looks correct (375px)
- [ ] Test passes

**Commit:** `checkpoint-2: Landing page with full SSR`

---

### Checkpoint 3: Profile Pages with Dynamic SSR

**Goal:** Profile pages render with user data server-side, unique meta tags per profile

**Verification Test:** Create `__tests__/checkpoint-3.test.ts`

```typescript
import { describe, it, expect } from 'vitest';

describe('Checkpoint 3: Profile Pages SSR', () => {
  it('profile page renders user name in HTML source', async () => {
    const response = await fetch('http://localhost:3000/p/test-user-nextjs');
    const html = await response.text();

    // Should contain profile name in initial HTML
    expect(html).toContain('Test User NextJS');
  });

  it('profile page has dynamic og:title with user name', async () => {
    const response = await fetch('http://localhost:3000/p/test-user-nextjs');
    const html = await response.text();

    expect(html).toContain('og:title');
    expect(html).toContain('Test User NextJS');
  });

  it('profile page returns 404 for non-existent user', async () => {
    const response = await fetch('http://localhost:3000/p/does-not-exist-12345');
    expect(response.status).toBe(404);
  });
});
```

**Implementation Tasks:**

1. **Create dynamic profile route:** `src/app/p/[slug]/page.tsx`

   ```typescript
   import { createClient } from '@/lib/supabase/server';
   import { notFound } from 'next/navigation';
   import type { Metadata } from 'next';
   import { ProfilePageClient } from './profile-page-client';

   interface Props {
     params: Promise<{ slug: string }>;
   }

   // Generate metadata for SEO
   export async function generateMetadata({ params }: Props): Promise<Metadata> {
     const { slug } = await params;
     const supabase = await createClient();

     const { data: profile } = await supabase
       .from('profiles')
       .select('name, role, reason')
       .eq('slug', slug)
       .single();

     if (!profile) {
       return {
         title: 'Profile Not Found - Clarity Pledge',
       };
     }

     const title = `${profile.name} - Clarity Pledge`;
     const description = profile.reason || `${profile.name} has signed the Clarity Pledge to communicate clearly.`;

     return {
       title,
       description,
       openGraph: {
         title: `${profile.name} signed the Clarity Pledge`,
         description,
         type: 'profile',
       },
       twitter: {
         card: 'summary',
         title,
         description,
       },
     };
   }

   // Server Component - fetches data server-side
   export default async function ProfilePage({ params }: Props) {
     const { slug } = await params;
     const supabase = await createClient();

     // Fetch profile
     const { data: profile, error } = await supabase
       .from('profiles')
       .select('*')
       .eq('slug', slug)
       .single();

     if (error || !profile) {
       notFound();
     }

     // Fetch witnesses separately (Supabase PostgREST limitation from CLAUDE.md)
     const { data: witnesses } = await supabase
       .from('witnesses')
       .select('*')
       .eq('profile_id', profile.id)
       .order('created_at', { ascending: false });

     return (
       <ProfilePageClient
         profile={{
           ...profile,
           witnesses: witnesses || [],
         }}
       />
     );
   }
   ```

2. **Create client component:** `src/app/p/[slug]/profile-page-client.tsx`

   ```typescript
   'use client';

   import { ClarityLandingLayout } from '@/app/layouts/clarity-landing-layout';
   import { ProfilePage as ProfilePageContent } from '@/app/pages/profile-page';
   import type { Profile } from '@/app/types';

   interface Props {
     profile: Profile;
   }

   export function ProfilePageClient({ profile }: Props) {
     return (
       <ClarityLandingLayout>
         <ProfilePageContent initialProfile={profile} />
       </ClarityLandingLayout>
     );
   }
   ```

3. **Update existing ProfilePage component:**

   In [src/app/pages/profile-page.tsx](src/app/pages/profile-page.tsx), update to accept `initialProfile` prop:

   ```typescript
   interface ProfilePageProps {
     initialProfile?: Profile;
   }

   export function ProfilePage({ initialProfile }: ProfilePageProps) {
     // Use initialProfile if provided (SSR), otherwise fetch client-side
     const [profile, setProfile] = useState<Profile | null>(initialProfile || null);

     // ... rest of existing logic
   }
   ```

4. **Create 404 page:** `src/app/not-found.tsx`

   ```typescript
   import Link from 'next/link';

   export default function NotFound() {
     return (
       <div className="min-h-screen flex items-center justify-center">
         <div className="text-center">
           <h1 className="text-4xl font-bold mb-4">404 - Not Found</h1>
           <p className="mb-4">The page you're looking for doesn't exist.</p>
           <Link href="/" className="text-blue-600 hover:underline">
             Go back home
           </Link>
         </div>
       </div>
     );
   }
   ```

**Playwright MCP Visual Check:**
```
1. Navigate to http://localhost:3000/p/test-user-nextjs
2. Take screenshot (desktop)
3. Verify: Profile name, certificate, witness section visible
4. View source (curl http://localhost:3000/p/test-user-nextjs)
5. Verify: "Test User NextJS" appears in HTML
6. Verify: og:title meta tag includes user name
7. Navigate to http://localhost:3000/p/fake-user-999
8. Verify: 404 page displays
9. Check console for errors (should be none)
```

**Done when:**
- [ ] Profile page renders user data server-side
- [ ] View-source shows profile name in HTML
- [ ] Unique meta tags per profile (check og:title)
- [ ] Non-existent profiles show 404
- [ ] Certificate and witness sections work
- [ ] Test passes

**Commit:** `checkpoint-3: Profile pages with dynamic SSR and unique meta tags`

---

### Checkpoint 4: Static Pages SSR (Manifesto, About)

**Goal:** Manifesto and About pages render server-side

**Verification Test:** Create `__tests__/checkpoint-4.test.ts`

```typescript
import { describe, it, expect } from 'vitest';

describe('Checkpoint 4: Static Pages SSR', () => {
  it('manifesto page renders in HTML source', async () => {
    const response = await fetch('http://localhost:3000/manifesto');
    const html = await response.text();

    expect(html).toContain('Manifesto');
    expect(response.status).toBe(200);
  });

  it('about page renders in HTML source', async () => {
    const response = await fetch('http://localhost:3000/about');
    const html = await response.text();

    expect(html).toContain('About');
    expect(response.status).toBe(200);
  });

  it('privacy policy page renders', async () => {
    const response = await fetch('http://localhost:3000/privacy-policy');
    expect(response.status).toBe(200);
  });

  it('terms of service page renders', async () => {
    const response = await fetch('http://localhost:3000/terms-of-service');
    expect(response.status).toBe(200);
  });
});
```

**Implementation Tasks:**

1. **Create manifesto page:** `src/app/manifesto/page.tsx`

   ```typescript
   import { FullArticlePage } from '@/app/pages/full-article-page';
   import { ClarityLandingLayout } from '@/app/layouts/clarity-landing-layout';
   import type { Metadata } from 'next';

   export const metadata: Metadata = {
     title: 'Manifesto - Clarity Pledge',
     description: 'Our commitment to clear communication and understanding.',
   };

   export default function ManifestoPage() {
     return (
       <ClarityLandingLayout>
         <FullArticlePage />
       </ClarityLandingLayout>
     );
   }
   ```

2. **Create about page:** `src/app/about/page.tsx`

   ```typescript
   import { AboutPage as AboutPageContent } from '@/app/pages/about-page';
   import { ClarityLandingLayout } from '@/app/layouts/clarity-landing-layout';
   import type { Metadata } from 'next';

   export const metadata: Metadata = {
     title: 'About - Clarity Pledge',
     description: 'Learn about the Clarity Pledge and our mission to improve communication.',
   };

   export default function AboutPage() {
     return (
       <ClarityLandingLayout>
         <AboutPageContent />
       </ClarityLandingLayout>
     );
   }
   ```

3. **Mark contact form as client component:**

   In [src/app/pages/about-page.tsx](src/app/pages/about-page.tsx), if it has a contact form with `useState`:

   ```typescript
   'use client'; // Add at top of file

   // ... rest of component
   ```

4. **Create privacy policy page:** `src/app/privacy-policy/page.tsx`

   ```typescript
   import { PrivacyPolicyPage as PrivacyContent } from '@/app/pages/privacy-policy-page';
   import { ClarityLandingLayout } from '@/app/layouts/clarity-landing-layout';
   import type { Metadata } from 'next';

   export const metadata: Metadata = {
     title: 'Privacy Policy - Clarity Pledge',
   };

   export default function PrivacyPolicyPage() {
     return (
       <ClarityLandingLayout>
         <PrivacyContent />
       </ClarityLandingLayout>
     );
   }
   ```

5. **Create terms of service page:** `src/app/terms-of-service/page.tsx`

   ```typescript
   import { TermsOfServicePage as TermsContent } from '@/app/pages/terms-of-service-page';
   import { ClarityLandingLayout } from '@/app/layouts/clarity-landing-layout';
   import type { Metadata } from 'next';

   export const metadata: Metadata = {
     title: 'Terms of Service - Clarity Pledge',
   };

   export default function TermsOfServicePage() {
     return (
       <ClarityLandingLayout>
         <TermsContent />
       </ClarityLandingLayout>
     );
   }
   ```

6. **Set up redirects in `next.config.js`:**

   ```javascript
   /** @type {import('next').NextConfig} */
   const nextConfig = {
     reactStrictMode: true,
     output: 'standalone',

     async redirects() {
       return [
         {
           source: '/clarity-champions',
           destination: '/pledgers',
           permanent: true,
         },
         {
           source: '/understanding-champions',
           destination: '/pledgers',
           permanent: true,
         },
         {
           source: '/clarity-demo',
           destination: '/demo',
           permanent: true,
         },
         {
           source: '/clarity-chat',
           destination: '/chat',
           permanent: true,
         },
       ];
     },

     async rewrites() {
       return {
         fallback: [
           {
             source: '/app/:path*',
             destination: 'http://localhost:5173/app/:path*',
           },
         ],
       };
     },
   };
   module.exports = nextConfig;
   ```

**Playwright MCP Visual Check:**
```
1. Navigate to http://localhost:3000/manifesto
2. Take screenshot (desktop)
3. Verify: Manifesto content visible
4. Navigate to http://localhost:3000/about
5. Take screenshot (desktop)
6. Verify: About content, contact form visible
7. Navigate to http://localhost:3000/privacy-policy
8. Verify: Privacy policy content visible
9. Check console for errors (should be none)
10. Test contact form submission (if present)
```

**Done when:**
- [ ] Manifesto page renders server-side
- [ ] About page renders server-side
- [ ] Privacy policy page works
- [ ] Terms of service page works
- [ ] All pages have proper meta tags
- [ ] Redirects work (old URLs → new URLs)
- [ ] Test passes

**Commit:** `checkpoint-4: Static pages with SSR (manifesto, about, legal)`

---

### Checkpoint 5: Pledgers Directory SSR

**Goal:** `/pledgers` page renders list of verified users server-side

**Verification Test:** Create `__tests__/checkpoint-5.test.ts`

```typescript
import { describe, it, expect } from 'vitest';

describe('Checkpoint 5: Pledgers Directory SSR', () => {
  it('pledgers page renders in HTML source', async () => {
    const response = await fetch('http://localhost:3000/pledgers');
    const html = await response.text();

    expect(html).toContain('Pledgers');
    expect(response.status).toBe(200);
  });

  it('pledgers page contains profile data in HTML', async () => {
    const response = await fetch('http://localhost:3000/pledgers');
    const html = await response.text();

    // Should have at least test profile
    expect(html).toMatch(/Test User|pledger/i);
  });
});
```

**Implementation Tasks:**

1. **Create pledgers page:** `src/app/pledgers/page.tsx`

   ```typescript
   import { createClient } from '@/lib/supabase/server';
   import { ClarityPledgersPageClient } from './pledgers-client';
   import type { Metadata } from 'next';

   export const metadata: Metadata = {
     title: 'Pledgers - Clarity Pledge',
     description: 'Meet the professionals who have committed to clear communication.',
   };

   export default async function PledgersPage() {
     const supabase = await createClient();

     // Fetch all verified profiles
     const { data: profiles } = await supabase
       .from('profiles')
       .select('*')
       .eq('is_verified', true)
       .order('signed_at', { ascending: false });

     return <ClarityPledgersPageClient profiles={profiles || []} />;
   }
   ```

2. **Create client component:** `src/app/pledgers/pledgers-client.tsx`

   ```typescript
   'use client';

   import { ClarityLandingLayout } from '@/app/layouts/clarity-landing-layout';
   import { ClarityPledgersPage } from '@/app/pages/clarity-pledgers-page';
   import type { Profile } from '@/app/types';

   interface Props {
     profiles: Profile[];
   }

   export function ClarityPledgersPageClient({ profiles }: Props) {
     return (
       <ClarityLandingLayout>
         <ClarityPledgersPage initialProfiles={profiles} />
       </ClarityLandingLayout>
     );
   }
   ```

3. **Update existing ClarityPledgersPage:**

   In [src/app/pages/clarity-pledgers-page.tsx](src/app/pages/clarity-pledgers-page.tsx), add `initialProfiles` prop:

   ```typescript
   interface ClarityPledgersPageProps {
     initialProfiles?: Profile[];
   }

   export function ClarityPledgersPage({ initialProfiles }: ClarityPledgersPageProps) {
     const [profiles, setProfiles] = useState<Profile[]>(initialProfiles || []);

     // ... rest of existing logic
   }
   ```

**Playwright MCP Visual Check:**
```
1. Navigate to http://localhost:3000/pledgers
2. Take screenshot (desktop)
3. Verify: List of pledgers visible (at least test user)
4. View source (curl http://localhost:3000/pledgers)
5. Verify: Profile names appear in HTML
6. Test redirect: http://localhost:3000/clarity-champions → /pledgers
7. Check console for errors
```

**Done when:**
- [ ] Pledgers directory renders server-side
- [ ] Profile list visible in HTML source
- [ ] Redirects work (`/clarity-champions` → `/pledgers`)
- [ ] Test passes

**Commit:** `checkpoint-5: Pledgers directory with SSR`

---

## Post-Migration Verification

After all checkpoints pass, run full verification:

### Build Verification
```bash
npm run build
npm run start
# Visit http://localhost:3000
# Test all migrated pages
```

### SEO Verification
```bash
# Landing page
curl http://localhost:3000 | grep "Clarity Pledge"

# Profile page
curl http://localhost:3000/p/test-user-nextjs | grep "Test User NextJS"

# Check meta tags
curl http://localhost:3000 | grep "og:title"
curl http://localhost:3000/p/test-user-nextjs | grep "og:title"
```

### Visual Regression Check (Playwright MCP)
```
1. Landing page (desktop + mobile)
2. Manifesto page
3. About page
4. Profile page (/p/test-user-nextjs)
5. Pledgers directory
6. Check all navigation links work
```

### Performance Check
```bash
# Check bundle sizes
npm run build:next
ls -lh .next/static/

# Lighthouse score (optional, via Chrome DevTools)
# Target: Performance > 90, SEO > 95
```

---

## Routes NOT Migrated (Staying as Vite SPA)

These routes will continue to be served by Vite SPA:

| Route | Why NOT Migrated |
|-------|------------------|
| `/live`, `/live/:code` | WebRTC realtime, high complexity, behind auth, no SEO benefit |
| `/chat` | Realtime chat, behind auth, no SEO benefit |
| `/demo` | Interactive prototype, no SEO benefit |
| `/settings` | Authenticated only, no SEO benefit |
| `/feed`, `/idea/:id` | Future features, low priority |
| `/sign-pledge`, `/auth/callback` | Auth flows, can stay SPA for now |

**These will continue to work** via Next.js rewrites to Vite dev server (dev) or static build (production).

---

## Deployment Strategy

### Development
```bash
npm run dev:all  # Runs Next.js (3000) + Vite (5173) in parallel
```

### Production Build
```bash
npm run build    # Builds both Next.js and Vite
npm run start    # Serves Next.js with Vite static assets
```

### Vercel Deployment (Future)
1. Deploy Next.js app to Vercel
2. Configure rewrites in `next.config.js` to serve Vite bundle
3. Both apps in one deployment

---

## Rollback Plan

If any checkpoint fails catastrophically:

1. **Revert to last working checkpoint:**
   ```bash
   git log --oneline | grep checkpoint
   git reset --hard <commit-sha>
   ```

2. **Document blocker:**
   ```bash
   echo "## Checkpoint N Failed\n\n**Error:** [description]\n**Attempted:** [what you tried]\n**Next step:** [alternative approach]" >> docs/technical/migration-blockers.md
   ```

3. **Try alternative approach** (if available)

4. **Stop and notify user** if stuck after 2 alternatives

---

## Success Metrics

### Technical
- [ ] All checkpoints pass (0-5)
- [ ] `npm run build` succeeds
- [ ] No TypeScript errors
- [ ] All tests pass
- [ ] No console errors in browser

### SEO
- [ ] Landing page HTML contains "Clarity Pledge" (view-source)
- [ ] Profile pages have unique meta tags (og:title includes user name)
- [ ] All public pages render without JS enabled

### Visual
- [ ] No layout regressions (Playwright screenshots match)
- [ ] Mobile views work (375px)
- [ ] Desktop views work (1280px)

### Performance
- [ ] First Contentful Paint < 1.5s
- [ ] Time to Interactive < 3s
- [ ] No loading flicker on public pages

---

## Sources

- [Supabase SSR for Next.js](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [Next.js App Router Documentation](https://nextjs.org/docs/app)
- [Next.js Incremental Adoption](https://nextjs.org/docs/app/building-your-application/upgrading/app-router-migration)
- [Learning Plan: AI Orchestration (TDD, /loop, boundaries)](features/learning-plan.md)

---

*Created: 2026-01-06*
*Approach: Incremental hybrid (public pages only)*
*Time estimate: 2-3 hours with `/loop` workflow*
