import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { getCurrentUser, generateSlug } from "@/polymet/data/api";

export function ProfileDiagnosticPage() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [rawProfile, setRawProfile] = useState<any>(null);
  const [allProfiles, setAllProfiles] = useState<any[]>([]);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (message: string) => {
    setLogs(prev => [...prev, `${new Date().toISOString()}: ${message}`]);
    console.log(message);
  };

  useEffect(() => {
    diagnose();
  }, []);

  const diagnose = async () => {
    try {
      addLog('🔍 Starting diagnostic...');
      
      // Get current auth user
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        addLog('❌ No authenticated user');
        return;
      }
      addLog(`✅ Auth user: ${authUser.email}`);

      // Get profile through API
      const apiUser = await getCurrentUser();
      setCurrentUser(apiUser);
      addLog(`📊 API User: ${JSON.stringify({
        id: apiUser?.id,
        name: apiUser?.name,
        slug: apiUser?.slug,
        email: apiUser?.email
      })}`);

      // Get raw profile from database
      const { data: rawProf, error: rawError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single();

      if (rawError) {
        addLog(`❌ Raw profile error: ${rawError.message}`);
      } else {
        setRawProfile(rawProf);
        addLog(`✅ Raw profile from DB: ${JSON.stringify({
          id: rawProf.id,
          name: rawProf.name,
          slug: rawProf.slug,
          email: rawProf.email
        })}`);
      }

      // Get all profiles to see if there are slug issues
      const { data: allProfs, error: allError } = await supabase
        .from('profiles')
        .select('id, name, email, slug')
        .order('created_at', { ascending: false });

      if (allError) {
        addLog(`❌ Error fetching all profiles: ${allError.message}`);
      } else {
        setAllProfiles(allProfs || []);
        const withoutSlug = (allProfs || []).filter(p => !p.slug || p.slug === '');
        addLog(`📊 Total profiles: ${allProfs?.length || 0}, Without slug: ${withoutSlug.length}`);
      }

    } catch (err: any) {
      addLog(`❌ Unexpected error: ${err.message}`);
    }
  };

  const fixMySlug = async () => {
    if (!rawProfile) {
      addLog('❌ No profile to fix');
      return;
    }

    try {
      const newSlug = generateSlug(rawProfile.name || 'user');
      addLog(`🔧 Generating slug from "${rawProfile.name}": ${newSlug}`);

      const { data, error } = await supabase
        .from('profiles')
        .update({ slug: newSlug })
        .eq('id', rawProfile.id)
        .select()
        .single();

      if (error) {
        addLog(`❌ Update error: ${error.message}`);
        
        // Check if it's because the column doesn't exist
        if (error.message.includes('column') && error.message.includes('slug')) {
          addLog('');
          addLog('🚨 THE SLUG COLUMN DOES NOT EXIST IN YOUR DATABASE!');
          addLog('');
          addLog('📋 TO FIX THIS:');
          addLog('1. Open Supabase Dashboard → SQL Editor');
          addLog('2. Run the migration script: supabase/add_slug_column_migration.sql');
          addLog('3. See FIX_MISSING_SLUG_COLUMN.md for detailed instructions');
          addLog('');
        }
      } else {
        addLog(`✅ Slug updated successfully!`);
        setRawProfile(data);
        // Reload diagnostic
        setTimeout(() => diagnose(), 500);
      }
    } catch (err: any) {
      addLog(`❌ Unexpected error: ${err.message}`);
    }
  };

  const fixAllSlugs = async () => {
    const profilesWithoutSlug = allProfiles.filter(p => !p.slug || p.slug === '');
    
    if (profilesWithoutSlug.length === 0) {
      addLog('✅ All profiles have slugs!');
      return;
    }

    addLog(`🔧 Fixing ${profilesWithoutSlug.length} profiles without slugs...`);

    for (const profile of profilesWithoutSlug) {
      const newSlug = generateSlug(profile.name || 'user');
      addLog(`  Updating ${profile.name} -> ${newSlug}`);

      const { error } = await supabase
        .from('profiles')
        .update({ slug: newSlug })
        .eq('id', profile.id);

      if (error) {
        addLog(`  ❌ Error updating ${profile.name}: ${error.message}`);
      } else {
        addLog(`  ✅ Updated ${profile.name}`);
      }
    }

    addLog('✅ Batch update complete!');
    setTimeout(() => diagnose(), 500);
  };

  return (
    <div className="min-h-screen p-8 bg-background">
      <div className="max-w-6xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold">Profile Slug Diagnostic</h1>

        {/* Alert if slug column is missing */}
        {rawProfile && rawProfile.slug === undefined && (
          <div className="p-6 border-2 border-red-500 rounded-lg bg-red-50 dark:bg-red-950/30">
            <h2 className="text-xl font-bold text-red-700 dark:text-red-400 mb-3">
              🚨 SLUG COLUMN MISSING IN DATABASE
            </h2>
            <div className="space-y-3 text-sm">
              <p className="font-semibold">
                The <code className="px-2 py-1 bg-red-100 dark:bg-red-900/50 rounded">slug</code> column 
                doesn't exist in your profiles table. This is why "View My Pledge" isn't working.
              </p>
              <div className="pl-4 border-l-4 border-red-400">
                <p className="font-semibold mb-2">To fix this:</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Open your Supabase Dashboard</li>
                  <li>Go to SQL Editor → New query</li>
                  <li>Copy and paste the contents of: <code className="px-2 py-1 bg-red-100 dark:bg-red-900/50 rounded">supabase/add_slug_column_migration.sql</code></li>
                  <li>Click "Run"</li>
                  <li>Come back here and refresh this page</li>
                </ol>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                See <strong>FIX_MISSING_SLUG_COLUMN.md</strong> for detailed instructions.
              </p>
            </div>
          </div>
        )}

        {/* Current User via API */}
        <div className="p-4 border rounded-lg bg-card">
          <h2 className="text-xl font-semibold mb-3">Current User (via API)</h2>
          {currentUser ? (
            <div className="space-y-1 text-sm font-mono">
              <p><strong>ID:</strong> {currentUser.id}</p>
              <p><strong>Name:</strong> {currentUser.name}</p>
              <p><strong>Email:</strong> {currentUser.email}</p>
              <p><strong>Slug:</strong> {currentUser.slug || <span className="text-red-500">❌ MISSING</span>}</p>
              <p><strong>Profile URL would be:</strong> /p/{currentUser.slug || currentUser.id}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Not loaded</p>
          )}
        </div>

        {/* Raw Profile from DB */}
        <div className="p-4 border rounded-lg bg-card">
          <h2 className="text-xl font-semibold mb-3">Raw Profile (from Database)</h2>
          {rawProfile ? (
            <div className="space-y-2">
              <div className="space-y-1 text-sm font-mono">
                <p><strong>ID:</strong> {rawProfile.id}</p>
                <p><strong>Name:</strong> {rawProfile.name}</p>
                <p><strong>Email:</strong> {rawProfile.email}</p>
                <p><strong>Slug:</strong> {rawProfile.slug || <span className="text-red-500">❌ MISSING</span>}</p>
                <p><strong>Created:</strong> {rawProfile.created_at}</p>
                <p><strong>Verified:</strong> {rawProfile.is_verified ? 'Yes' : 'No'}</p>
              </div>
              {(!rawProfile.slug || rawProfile.slug === '') && (
                <Button onClick={fixMySlug} variant="default" size="sm" className="mt-2">
                  Fix My Slug
                </Button>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Not loaded</p>
          )}
        </div>

        {/* All Profiles Summary */}
        <div className="p-4 border rounded-lg bg-card">
          <h2 className="text-xl font-semibold mb-3">All Profiles Summary</h2>
          <div className="space-y-2">
            <p className="text-sm">
              <strong>Total Profiles:</strong> {allProfiles.length}
            </p>
            <p className="text-sm">
              <strong>Profiles Without Slug:</strong>{' '}
              {allProfiles.filter(p => !p.slug || p.slug === '').length}
            </p>
            
            {allProfiles.filter(p => !p.slug || p.slug === '').length > 0 && (
              <>
                <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded border border-yellow-200 dark:border-yellow-800">
                  <p className="text-sm font-semibold mb-2">Profiles needing slug fix:</p>
                  <ul className="text-xs space-y-1 font-mono">
                    {allProfiles
                      .filter(p => !p.slug || p.slug === '')
                      .map(p => (
                        <li key={p.id}>
                          {p.name} ({p.email})
                        </li>
                      ))}
                  </ul>
                </div>
                <Button onClick={fixAllSlugs} variant="default" size="sm">
                  Fix All Missing Slugs
                </Button>
              </>
            )}
          </div>
        </div>

        {/* All Profiles Table */}
        <div className="p-4 border rounded-lg bg-card">
          <h2 className="text-xl font-semibold mb-3">All Profiles</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Name</th>
                  <th className="text-left p-2">Email</th>
                  <th className="text-left p-2">Slug</th>
                  <th className="text-left p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {allProfiles.map(p => (
                  <tr key={p.id} className="border-b">
                    <td className="p-2">{p.name}</td>
                    <td className="p-2 font-mono text-xs">{p.email}</td>
                    <td className="p-2 font-mono text-xs">
                      {p.slug || <span className="text-red-500">MISSING</span>}
                    </td>
                    <td className="p-2">
                      {p.slug ? (
                        <span className="text-green-500">✓</span>
                      ) : (
                        <span className="text-red-500">✗</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Logs */}
        <div className="p-4 border rounded-lg bg-card">
          <h2 className="text-xl font-semibold mb-3">Diagnostic Logs</h2>
          <div className="space-y-1 text-xs font-mono max-h-96 overflow-y-auto bg-muted p-3 rounded">
            {logs.map((log, i) => (
              <div key={i}>{log}</div>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={diagnose}>Refresh Diagnostic</Button>
        </div>
      </div>
    </div>
  );
}

