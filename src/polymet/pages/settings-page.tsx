import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getCurrentUser, updateProfile, type Profile } from "@/polymet/data/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { SaveIcon, LoaderIcon } from "lucide-react";

export function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  // Form state
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const user = await getCurrentUser();
        if (!user) {
          // Not logged in, redirect to home
          navigate("/");
          return;
        }
        setProfile(user);
        
        // Initialize form fields
        setName(user.name);
        setRole(user.role || "");
        setLinkedinUrl(user.linkedinUrl || "");
        setReason(user.reason || "");
      } catch (error) {
        console.error("Failed to load profile:", error);
        navigate("/");
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [navigate]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!profile) return;
    
    setSaving(true);
    
    try {
      // Normalize LinkedIn URL - add https:// if missing
      let normalizedLinkedInUrl = linkedinUrl.trim();
      if (normalizedLinkedInUrl && !normalizedLinkedInUrl.match(/^https?:\/\//i)) {
        normalizedLinkedInUrl = `https://${normalizedLinkedInUrl}`;
      }

      const { error } = await updateProfile(profile.id, {
        name: name.trim(),
        role: role.trim() || undefined,
        linkedinUrl: normalizedLinkedInUrl || undefined,
        reason: reason.trim() || undefined,
      });

      if (error) {
        console.error("Error updating profile:", error);
        toast.error("Failed to save changes. Please try again.");
      } else {
        toast.success("Settings saved successfully!");
        
        // Reload the profile to get updated slug
        const updatedUser = await getCurrentUser();
        if (updatedUser) {
          setProfile(updatedUser);
        }
      }
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error("An unexpected error occurred.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading Settings...</div>
      </div>
    );
  }

  if (!profile) {
    return null; // Will redirect in useEffect
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-2xl py-12 px-4">
        <div className="space-y-8">
          {/* Header */}
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2">
              Settings
            </h1>
            <p className="text-muted-foreground">
              Update your pledge information
            </p>
          </div>

          {/* Settings Form */}
          <form onSubmit={handleSave} className="space-y-6">
            <div className="border border-border rounded-lg p-6 bg-card space-y-6">
              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="name">
                  Full Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Your full name"
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  This will appear on your pledge certificate
                </p>
              </div>

              {/* Role */}
              <div className="space-y-2">
                <Label htmlFor="role">Role / Title</Label>
                <Input
                  id="role"
                  type="text"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="e.g., CEO at Company, Product Designer"
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  Optional: Your professional role or title
                </p>
              </div>

              {/* LinkedIn URL */}
              <div className="space-y-2">
                <Label htmlFor="linkedin">LinkedIn Profile URL</Label>
                <Input
                  id="linkedin"
                  type="text"
                  value={linkedinUrl}
                  onChange={(e) => setLinkedinUrl(e.target.value)}
                  placeholder="linkedin.com/in/yourprofile"
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  Optional: Link to your LinkedIn profile for verification
                </p>
              </div>

              {/* Reason */}
              <div className="space-y-2">
                <Label htmlFor="reason">Why I Took This Pledge</Label>
                <Textarea
                  id="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Share your personal story or motivation..."
                  className="w-full min-h-[120px]"
                />
                <p className="text-xs text-muted-foreground">
                  Optional: Share why clarity matters to you
                </p>
              </div>

              {/* Email (read-only) */}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={profile.email}
                  disabled
                  className="w-full bg-muted"
                />
                <p className="text-xs text-muted-foreground">
                  Email cannot be changed
                </p>
              </div>
            </div>

            {/* Save Button */}
            <div className="flex gap-4">
              <Button
                type="submit"
                disabled={saving || !name.trim()}
                className="bg-[#0044CC] hover:bg-[#003399] text-white"
              >
                {saving ? (
                  <>
                    <LoaderIcon className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <SaveIcon className="w-4 h-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
              
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/dashboard")}
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

