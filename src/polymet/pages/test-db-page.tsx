/**
 * @file test-db-page.tsx
 * @description This is a developer-facing tool for testing the database connection and data integrity.
 * It provides a simple interface to view all profiles in the database,
 * check their verification status, and manually verify them.
 * This page is crucial for developers to ensure that the database is working as expected,
 * that Row Level Security (RLS) policies are correctly configured,
 * and to quickly fix data inconsistencies during development and testing.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { CheckCircleIcon, XCircleIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function TestDbPage() {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [verifiedProfilesFromApi, setVerifiedProfilesFromApi] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifyingAll, setVerifyingAll] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    testDatabase();
  }, []);

  const testDatabase = async () => {
    setLoading(true);
    setError(null);

    try {
      console.log("🧪 Testing database connection...");

      // Test 1: Can we connect?
      const { data: testData, error: testError } = await supabase
        .from('profiles')
        .select('count');

      if (testError) {
        console.error("❌ Connection test failed:", testError);
        setError(`Connection failed: ${testError.message}`);
        setLoading(false);
        return;
      }

      console.log("✅ Database connection OK");

      // Test 2: Can we read profiles?
      const { data: allProfiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) {
        console.error("❌ Error reading profiles:", profilesError);
        setError(`Error reading profiles: ${profilesError.message}`);
      } else {
        console.log("✅ Profiles loaded:", allProfiles);
        setProfiles(allProfiles || []);
      }

      // Test 3: Check what getVerifiedProfiles() returns
      console.log("🧪 Testing getVerifiedProfiles() function...");
      const { getVerifiedProfiles } = await import("@/polymet/data/api");
      const verifiedProfiles = await getVerifiedProfiles();
      console.log("✅ getVerifiedProfiles() returned:", verifiedProfiles);
      setVerifiedProfilesFromApi(verifiedProfiles);
    } catch (err: any) {
      console.error("❌ Unexpected error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const verifyAllProfiles = async () => {
    setVerifyingAll(true);
    try {
      const { error: verifyError } = await supabase
        .from('profiles')
        .update({ is_verified: true })
        .eq('is_verified', false);

      if (verifyError) {
        console.error("❌ Error verifying profiles:", verifyError);
        setError(`Error verifying profiles: ${verifyError.message}`);
      } else {
        console.log("✅ All profiles verified!");
        await testDatabase(); // Refresh the list
      }
    } catch (err: any) {
      console.error("❌ Unexpected error:", err);
      setError(err.message);
    } finally {
      setVerifyingAll(false);
    }
  };

  const verifyProfile = async (profileId: string) => {
    try {
      const { error: verifyError } = await supabase
        .from('profiles')
        .update({ is_verified: true })
        .eq('id', profileId);

      if (verifyError) {
        console.error("❌ Error verifying profile:", verifyError);
        setError(`Error verifying profile: ${verifyError.message}`);
      } else {
        console.log("✅ Profile verified!");
        await testDatabase(); // Refresh the list
      }
    } catch (err: any) {
      console.error("❌ Unexpected error:", err);
      setError(err.message);
    }
  };

  const verifiedCount = profiles.filter(p => p.is_verified).length;
  const unverifiedCount = profiles.filter(p => !p.is_verified).length;

  const testDirectQuery = async () => {
    console.log("🧪 Testing direct Supabase query...");
    
    // Test 1: Simple query
    const { data: simple, error: simpleError } = await supabase
      .from('profiles')
      .select('*')
      .eq('is_verified', true);
    
    console.log("Simple query result:", { data: simple, error: simpleError });
    
    // Test 2: With nested witnesses (the problematic one)
    const { data: nested, error: nestedError } = await supabase
      .from('profiles')
      .select('*, witnesses (*)')
      .eq('is_verified', true);
    
    console.log("Nested query result:", { data: nested, error: nestedError });
    
    alert(`Check browser console for results.\nSimple: ${simple?.length || 0} profiles\nNested: ${nested?.length || 0} profiles`);
  };

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold">Database Test Page</h1>

        {loading && <p>Loading...</p>}

        {error && (
          <div className="p-4 border border-red-500 rounded-lg bg-red-50 dark:bg-red-900/20">
            <h2 className="text-xl font-semibold mb-2 text-red-700 dark:text-red-400">
              Error
            </h2>
            <p className="text-sm text-red-600 dark:text-red-300">{error}</p>
          </div>
        )}

        <div className="p-4 border rounded-lg bg-muted">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold">
                Profiles in Database: {profiles.length}
              </h2>
              <div className="flex gap-4 mt-2 text-sm">
                <span className="flex items-center gap-1">
                  <CheckCircleIcon className="w-4 h-4 text-green-600" />
                  <strong>Verified:</strong> {verifiedCount}
                </span>
                <span className="flex items-center gap-1">
                  <XCircleIcon className="w-4 h-4 text-red-600" />
                  <strong>Unverified:</strong> {unverifiedCount}
                </span>
              </div>
            </div>
            {unverifiedCount > 0 && (
              <Button 
                onClick={verifyAllProfiles} 
                disabled={verifyingAll}
                variant="default"
              >
                {verifyingAll ? "Verifying..." : `Verify All (${unverifiedCount})`}
              </Button>
            )}
          </div>
          
          {profiles.length === 0 && !loading && !error && (
            <p className="text-muted-foreground">No profiles found</p>
          )}
          <div className="space-y-4">
            {profiles.map((profile) => (
              <div
                key={profile.id}
                className={`p-4 border rounded-lg bg-background space-y-2 ${
                  !profile.is_verified ? 'border-orange-500 border-2' : ''
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2">
                      <p>
                        <strong>Name:</strong> {profile.name}
                      </p>
                      {profile.is_verified ? (
                        <CheckCircleIcon className="w-4 h-4 text-green-600" />
                      ) : (
                        <XCircleIcon className="w-4 h-4 text-orange-600" />
                      )}
                    </div>
                    <p>
                      <strong>Email:</strong> {profile.email}
                    </p>
                    {profile.role && (
                      <p>
                        <strong>Role:</strong> {profile.role}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      <strong>ID:</strong> {profile.id}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <strong>Created:</strong>{" "}
                      {new Date(profile.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() =>
                      (window.location.href = `/p/${profile.slug || profile.id}`)
                    }
                    size="sm"
                    variant="outline"
                  >
                    View Pledge
                  </Button>
                  {!profile.is_verified && (
                    <Button
                      onClick={() => verifyProfile(profile.id)}
                      size="sm"
                      variant="default"
                    >
                      Verify This Profile
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 border rounded-lg bg-blue-50 dark:bg-blue-900/20">
          <h2 className="text-xl font-semibold mb-4">
            getVerifiedProfiles() API Test
          </h2>
          <p className="text-sm mb-2">
            This shows what the signatories page is actually receiving from the API:
          </p>
          <div className="p-3 bg-white dark:bg-gray-900 rounded border font-mono text-xs overflow-auto">
            {loading ? (
              <p>Loading...</p>
            ) : verifiedProfilesFromApi.length === 0 ? (
              <p className="text-red-600 font-bold">⚠️ API returned 0 verified profiles!</p>
            ) : (
              <div>
                <p className="text-green-600 font-bold mb-2">
                  ✅ API returned {verifiedProfilesFromApi.length} profile(s)
                </p>
                <pre className="whitespace-pre-wrap">
                  {JSON.stringify(verifiedProfilesFromApi, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button onClick={testDatabase}>Refresh</Button>
          <Button 
            onClick={() => navigate("/clarity-champions")}
            variant="outline"
          >
            View Clarity Champions Page
          </Button>
          <Button 
            onClick={testDirectQuery}
            variant="secondary"
          >
            Test Direct Query
          </Button>
        </div>
      </div>
    </div>
  );
}

