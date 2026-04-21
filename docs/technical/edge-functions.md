# Edge Functions

Supabase edge functions live in `supabase/functions/`. Each function has its own `index.ts` entry point.

## CORS

All edge functions must use the shared CORS helper. Never declare a local `corsHeaders` constant:

```ts
// ✅ Correct
import { buildCorsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  // ...
});

// ❌ Wrong — breaks on any worktree that isn't on the env var port
const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? 'https://claritypledge.com';
const corsHeaders = { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN, ... };
```

The helper (`supabase/functions/_shared/cors.ts`) accepts any recognized origin per-request: all dev worktree ports (w0=5001, w1=5100…w7=5700), Vercel preview URLs, and prod. The pre-commit check enforces this pattern — a function that declares a local `corsHeaders` object without importing `buildCorsHeaders` will be blocked.

## Shared modules

Place shared utilities in `supabase/functions/_shared/`. Import via relative path:

```ts
import { buildCorsHeaders } from '../_shared/cors.ts';
```
