/**
 * @file settings-page.tsx
 * @description Protected settings page where authenticated users can edit their profile.
 * Redirects unauthenticated users to /sign-pledge.
 */
import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/auth";
import { updateProfile } from "@/app/data/api";
import { toast } from "sonner";
import { ArrowLeftIcon, Loader2Icon, CheckIcon } from "lucide-react";

export function SettingsPage() {
  const navigate = useNavigate();
  const { user, session, isLoading: authLoading, refreshProfile } = useAuth();

  // Form state
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [reason, setReason] = useState("");

  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; linkedinUrl?: string }>({});

  // Populate form with current profile data
  useEffect(() => {
    if (user) {
      setName(user.name || "");
      setRole(user.role || "");
      setLinkedinUrl(user.linkedinUrl || "");
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
      reason !== (user.reason || "");

    setHasChanges(changed);
  }, [name, role, linkedinUrl, reason, user]);

  // Validation
  const validate = (): boolean => {
    const newErrors: { name?: string; linkedinUrl?: string } = {};

    if (!name.trim()) {
      newErrors.name = "Name is required";
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
      reason: reason.trim() || undefined,
    });

    if (error) {
      toast.error("Failed to save changes. Please try again.");
      setIsSaving(false);
      return;
    }

    // Refresh profile in auth context
    await refreshProfile();

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
          to={`/p/${user?.slug}`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeftIcon className="w-4 h-4 mr-1" />
          Back to Profile
        </Link>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-2">
          Update your public profile information
        </p>
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
            Why I took the pledge
          </label>
          <textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            className="w-full px-4 py-3 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            placeholder="Share why clear communication matters to you..."
          />
        </div>

        {/* Submit Button */}
        <div className="pt-4">
          <button
            type="submit"
            disabled={!hasChanges || isSaving}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-blue-500 hover:bg-blue-600 text-white font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
          </button>
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
