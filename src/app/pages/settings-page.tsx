/**
 * @file settings-page.tsx
 * @description Protected settings page where authenticated users can edit their profile.
 * Redirects unauthenticated users to /sign-pledge.
 */
import { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/auth";
import { updateProfile } from "@/app/data/api";
import { toast } from "sonner";
import { ArrowLeftIcon, Loader2Icon, CheckIcon } from "lucide-react";
import { analytics } from "@/lib/mixpanel";
import { Button } from "@/components/ui/button";
import { InstallCard } from "@/app/components/pwa/install-card";

export function SettingsPage() {
  const navigate = useNavigate();
  const { user, session, isLoading: authLoading, refreshProfile } = useAuth();

  // Form state
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [bio, setBio] = useState("");
  const [reason, setReason] = useState("");

  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; linkedinUrl?: string }>({});
  const hasTrackedPageView = useRef(false);

  // Track page view (once per mount, after auth loaded)
  useEffect(() => {
    if (!authLoading && session && user && !hasTrackedPageView.current) {
      hasTrackedPageView.current = true;
      analytics.track('settings_page_viewed', {
        profile_slug: user.slug,
      });
    }
  }, [authLoading, session, user]);

  // Populate form with current profile data
  useEffect(() => {
    if (user) {
      setName(user.name || "");
      setRole(user.role || "");
      setLinkedinUrl(user.linkedinUrl || "");
      setBio(user.bio || "");
      setReason(user.reason || "");
    }
  }, [user]);

  // Redirect unauthenticated users
  useEffect(() => {
    if (!authLoading && !session) {
      navigate("/sign-pledge");
    }
  }, [authLoading, session, navigate]);

  // Track changes
  useEffect(() => {
    if (!user) return;

    const changed =
      name !== (user.name || "") ||
      role !== (user.role || "") ||
      linkedinUrl !== (user.linkedinUrl || "") ||
      bio !== (user.bio || "") ||
      reason !== (user.reason || "");

    setHasChanges(changed);
  }, [name, role, linkedinUrl, bio, reason, user]);

  // Validation
  const validate = (): boolean => {
    const newErrors: { name?: string; linkedinUrl?: string } = {};

    if (!name.trim()) {
      newErrors.name = "Name is required";
    } else {
      // Validate full name format (first and last, each 2+ chars) - consistent with pledge form
      const nameParts = name.trim().split(/\s+/);
      if (nameParts.length < 2 || nameParts.some(part => part.length < 2)) {
        newErrors.name = "Please enter your full name (first and last, each at least 2 characters)";
      }
    }

    // Validate LinkedIn URL if provided
    if (linkedinUrl.trim()) {
      try {
        const url = new URL(linkedinUrl.trim());
        // Must be HTTPS and exactly linkedin.com domain (not subdomain impersonation)
        const isValidLinkedIn =
          url.protocol === "https:" &&
          (url.hostname === "linkedin.com" ||
            url.hostname === "www.linkedin.com" ||
            url.hostname.endsWith(".linkedin.com"));

        if (!isValidLinkedIn) {
          newErrors.linkedinUrl =
            "Please enter a valid LinkedIn URL (e.g., https://linkedin.com/in/yourprofile)";
        }
      } catch {
        newErrors.linkedinUrl =
          "Please enter a valid LinkedIn URL (e.g., https://linkedin.com/in/yourprofile)";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate() || !user?.id) return;

    setIsSaving(true);

    const { error } = await updateProfile(user.id, {
      name: name.trim(),
      role: role.trim() || undefined,
      linkedin_url: linkedinUrl.trim() || undefined,
      bio: bio.trim() || null,
      reason: reason.trim() || undefined,
    });

    if (error) {
      analytics.track('profile_update_error', {
        profile_slug: user?.slug,
      });
      toast.error("Failed to save changes. Please try again.");
      setIsSaving(false);
      return;
    }

    // Refresh profile in auth context
    await refreshProfile();

    analytics.track('profile_updated', {
      profile_slug: user?.slug,
      fields_updated: [
        name.trim() !== (user?.name || '') && 'name',
        role.trim() !== (user?.role || '') && 'role',
        linkedinUrl.trim() !== (user?.linkedinUrl || '') && 'linkedin',
        reason.trim() !== (user?.reason || '') && 'reason',
      ].filter(Boolean),
    });
    toast.success("Profile updated successfully!");
    setHasChanges(false);
    setIsSaving(false);
  };

  // Show loading state while checking auth
  if (authLoading) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-2xl">
        <div className="flex items-center justify-center">
          <Loader2Icon className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  // Don't render if not authenticated (redirect will happen)
  if (!session) {
    return null;
  }

  return (
    <div className="container mx-auto px-4 py-8 md:py-12 max-w-2xl">
      {/* Header */}
      <div className="mb-8">
        <Link
          to="/events"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeftIcon className="w-4 h-4 mr-1" />
          Back
        </Link>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-2">
          Update your public profile information
        </p>
      </div>

      {/* P493: PWA install card */}
      <div className="mb-8">
        <h2 className="text-sm font-medium mb-3 text-muted-foreground">App</h2>
        <InstallCard />
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Name */}
        <div>
          <label
            htmlFor="name"
            className="block text-sm font-medium mb-2"
          >
            Name <span className="text-red-500">*</span>
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-describedby={errors.name ? "name-error" : undefined}
            aria-invalid={errors.name ? "true" : undefined}
            className={`w-full px-4 py-3 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring ${
              errors.name ? "border-red-500" : "border-input"
            }`}
            placeholder="Your full name"
          />
          {errors.name && (
            <p id="name-error" className="text-sm text-red-500 mt-1" role="alert">{errors.name}</p>
          )}
        </div>

        {/* Role */}
        <div>
          <label
            htmlFor="role"
            className="block text-sm font-medium mb-2"
          >
            Role / Position
          </label>
          <input
            id="role"
            type="text"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full px-4 py-3 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="e.g., Product Manager at Acme Inc"
          />
        </div>

        {/* Bio */}
        <div>
          <label htmlFor="bio" className="block text-sm font-medium mb-2">
            Bio
          </label>
          <textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={160}
            rows={3}
            className="w-full px-4 py-3 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none text-sm"
            placeholder="A short description about you..."
            aria-describedby="bio-counter"
          />
          <div className="flex justify-between mt-1">
            <span className="text-xs text-muted-foreground">Links auto-detected and made clickable.</span>
            <span
              id="bio-counter"
              aria-live="polite"
              className={`text-xs ${bio.length >= 160 ? 'text-red-500' : 'text-muted-foreground'}`}
            >
              {bio.length}/160
            </span>
          </div>
        </div>

        {/* LinkedIn URL */}
        <div>
          <label
            htmlFor="linkedin"
            className="block text-sm font-medium mb-2"
          >
            LinkedIn URL
          </label>
          <input
            id="linkedin"
            type="url"
            value={linkedinUrl}
            onChange={(e) => setLinkedinUrl(e.target.value)}
            aria-describedby={errors.linkedinUrl ? "linkedin-error" : undefined}
            aria-invalid={errors.linkedinUrl ? "true" : undefined}
            className={`w-full px-4 py-3 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring ${
              errors.linkedinUrl ? "border-red-500" : "border-input"
            }`}
            placeholder="https://linkedin.com/in/yourprofile"
          />
          {errors.linkedinUrl && (
            <p id="linkedin-error" className="text-sm text-red-500 mt-1" role="alert">{errors.linkedinUrl}</p>
          )}
        </div>

        {/* Reason */}
        <div>
          <label
            htmlFor="reason"
            className="block text-sm font-medium mb-2"
          >
            What inspired me to take the pledge?
          </label>
          <textarea
            id="reason"
            value={reason}
            onChange={(e) => {
              const val = e.target.value;
              setReason(val.length <= 280 ? val : val.slice(0, 280));
            }}
            maxLength={280}
            rows={4}
            className="w-full px-4 py-3 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            placeholder="Share why clear communication matters to you..."
          />
          <div className="flex justify-end mt-1">
            <span className={`text-sm ${reason.length >= 280 ? 'text-red-500' : 'text-muted-foreground'}`}>
              {reason.length}/280
            </span>
          </div>
        </div>

        {/* Submit Button */}
        <div className="pt-4">
          <Button
            type="submit"
            disabled={!hasChanges || isSaving}
          >
            {isSaving ? (
              <>
                <Loader2Icon className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <CheckIcon className="w-4 h-4" />
                Save Changes
              </>
            )}
          </Button>
          {!hasChanges && !isSaving && (
            <span className="ml-4 text-sm text-muted-foreground">
              No changes to save
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
