import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function DebugPage() {
  const [authUser, setAuthUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [testEmail, setTestEmail] = useState("");

  const addLog = (message: string) => {
    setLogs(prev => [...prev, `${new Date().toISOString()}: ${message}`]);
    console.log(message);
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      addLog("Checking auth session...");
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        addLog(`Session error: ${sessionError.message}`);
        setError(sessionError.message);
        return;
      }

      if (session?.user) {
        addLog(`✅ Auth user found: ${session.user.email}`);
        setAuthUser(session.user);

        // Try to get profile
        addLog(`Fetching profile for user ID: ${session.user.id}`);
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();

        if (profileError) {
          addLog(`❌ Profile error: ${profileError.message}`);
          setError(`Profile not found: ${profileError.message}`);
        } else if (profileData) {
          addLog(`✅ Profile found: ${profileData.name}`);
          setProfile(profileData);
        }
      } else {
        addLog("❌ No auth session found");
        setError("Not authenticated");
      }
    } catch (err: any) {
      addLog(`❌ Unexpected error: ${err.message}`);
      setError(err.message);
    }
  };

  const generateSlug = (name: string): string => {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/--+/g, '-'); // Replace multiple hyphens with single hyphen
  };

  const createProfileManually = async () => {
    if (!authUser) {
      addLog("❌ No auth user to create profile for");
      return;
    }

    try {
      addLog("Attempting to create profile...");
      const name = authUser.user_metadata?.name || "Anonymous User";
      const slug = generateSlug(name);
      
      const { data, error } = await supabase
        .from('profiles')
        .insert({
          id: authUser.id,
          email: authUser.email,
          name: name,
          slug: slug,
          role: authUser.user_metadata?.role,
          linkedin_url: authUser.user_metadata?.linkedin_url,
          reason: authUser.user_metadata?.reason,
          avatar_color: authUser.user_metadata?.avatar_color || "#0044CC",
          is_verified: true,
        })
        .select()
        .single();

      if (error) {
        addLog(`❌ Create profile error: ${error.message}`);
        setError(error.message);
      } else {
        addLog(`✅ Profile created successfully!`);
        setProfile(data);
      }
    } catch (err: any) {
      addLog(`❌ Unexpected error: ${err.message}`);
      setError(err.message);
    }
  };

  const fixMissingSlug = async () => {
    if (!profile || !profile.name) {
      addLog("❌ No profile or name to generate slug from");
      return;
    }

    try {
      const newSlug = generateSlug(profile.name);
      addLog(`Generating slug from name "${profile.name}": ${newSlug}`);
      
      const { data, error } = await supabase
        .from('profiles')
        .update({ slug: newSlug })
        .eq('id', profile.id)
        .select()
        .single();

      if (error) {
        addLog(`❌ Update slug error: ${error.message}`);
        setError(error.message);
      } else {
        addLog(`✅ Slug updated successfully to: ${newSlug}`);
        setProfile(data);
      }
    } catch (err: any) {
      addLog(`❌ Unexpected error: ${err.message}`);
      setError(err.message);
    }
  };

  const sendMagicLink = async () => {
    if (!testEmail) {
      addLog("❌ Please enter an email");
      return;
    }

    try {
      addLog(`Sending magic link to ${testEmail}...`);
      const { error } = await supabase.auth.signInWithOtp({
        email: testEmail,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        addLog(`❌ Error sending magic link: ${error.message}`);
        setError(error.message);
      } else {
        addLog(`✅ Magic link sent! Check your email at ${testEmail}`);
      }
    } catch (err: any) {
      addLog(`❌ Unexpected error: ${err.message}`);
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold">Debug Page</h1>
        
        <div className="space-y-4">
          <div className="p-4 border rounded-lg bg-muted">
            <h2 className="text-xl font-semibold mb-2">Auth Status</h2>
            {authUser ? (
              <div className="space-y-1 text-sm">
                <p>✅ <strong>Authenticated</strong></p>
                <p><strong>User ID:</strong> {authUser.id}</p>
                <p><strong>Email:</strong> {authUser.email}</p>
                <p><strong>Email Confirmed:</strong> {authUser.email_confirmed_at ? "Yes" : "No"}</p>
                <p><strong>Created:</strong> {new Date(authUser.created_at).toLocaleString()}</p>
              </div>
            ) : (
              <p className="text-sm">❌ Not authenticated</p>
            )}
          </div>

          <div className="p-4 border rounded-lg bg-muted">
            <h2 className="text-xl font-semibold mb-2">Profile Status</h2>
            {profile ? (
              <div className="space-y-1 text-sm">
                <p>✅ <strong>Profile Found</strong></p>
                <p><strong>Name:</strong> {profile.name}</p>
                <p><strong>Email:</strong> {profile.email}</p>
                <p><strong>Slug:</strong> {profile.slug || <span className="text-red-500">⚠️ MISSING</span>}</p>
                <p><strong>Profile URL:</strong> {profile.slug ? (
                  <a href={`/p/${profile.slug}`} className="text-blue-500 hover:underline">
                    /p/{profile.slug}
                  </a>
                ) : (
                  <span className="text-red-500">Cannot generate (no slug)</span>
                )}</p>
                <p><strong>Verified:</strong> {profile.is_verified ? "Yes" : "No"}</p>
                <p><strong>Created:</strong> {new Date(profile.created_at).toLocaleString()}</p>
                {!profile.slug && (
                  <div className="mt-3">
                    <Button onClick={fixMissingSlug} variant="outline" size="sm">
                      Generate Missing Slug
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm">❌ No profile found</p>
                {authUser && (
                  <Button onClick={createProfileManually} variant="outline">
                    Create Profile Manually
                  </Button>
                )}
              </div>
            )}
          </div>

          {error && (
            <div className="p-4 border border-red-500 rounded-lg bg-red-50 dark:bg-red-900/20">
              <h2 className="text-xl font-semibold mb-2 text-red-700 dark:text-red-400">Error</h2>
              <p className="text-sm text-red-600 dark:text-red-300">{error}</p>
            </div>
          )}

          <div className="p-4 border rounded-lg bg-muted">
            <h2 className="text-xl font-semibold mb-2">Logs</h2>
            <div className="space-y-1 text-xs font-mono max-h-64 overflow-y-auto">
              {logs.map((log, i) => (
                <div key={i}>{log}</div>
              ))}
            </div>
          </div>

          <div className="p-4 border rounded-lg bg-blue-50 dark:bg-blue-900/20">
            <h2 className="text-xl font-semibold mb-3">Test Authentication</h2>
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="your@email.com"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  className="flex-1"
                />
                <Button onClick={sendMagicLink}>Send Magic Link</Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Enter your email to receive a login link. Check your email and click the link to authenticate.
              </p>
            </div>
          </div>

          <div className="space-x-2">
            <Button onClick={checkAuth}>Refresh</Button>
            <Button onClick={() => supabase.auth.signOut()} variant="outline">
              Sign Out
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

