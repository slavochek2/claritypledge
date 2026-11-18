// The settings every sign-in-mail function needs before it can answer (P1705: one copy, not two).
// Returns them, or the 500 response to send when any is missing.
export interface SigninEnv {
  supabaseUrl: string;
  serviceRoleKey: string;
  ipHashSecret: string;
}

export function signinEnvOrError(
  fn: string,
  userMessage: string,
  corsHeaders: Record<string, string>,
  mailConfigured: boolean,
): SigninEnv | Response {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const ipHashSecret = Deno.env.get('IP_HASH_SECRET');
  if (!supabaseUrl || !serviceRoleKey || !mailConfigured || !ipHashSecret) {
    console.error(`[${fn}] SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MAILGUN_API_KEY, MAILGUN_DOMAIN or IP_HASH_SECRET not configured`);
    return new Response(
      JSON.stringify({ error: 'INTERNAL', message: userMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
  return { supabaseUrl, serviceRoleKey, ipHashSecret };
}

// Build the request handler once the settings are present, or answer with the 500 above.
export function serveSignin(
  fn: string,
  userMessage: string,
  corsHeaders: Record<string, string>,
  mailConfigured: boolean,
  build: (env: SigninEnv) => (req: Request) => Promise<Response>,
  req: Request,
): Promise<Response> | Response {
  const env = signinEnvOrError(fn, userMessage, corsHeaders, mailConfigured);
  return env instanceof Response ? env : build(env)(req);
}
