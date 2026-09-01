/**
 * @file settings-page.tsx
 * @description Protected settings page where authenticated users can edit their profile.
 * Redirects unauthenticated users to /sign-pledge.
 */
import { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/auth";
import { updateProfile, setMyPledge, eraseMyAccount } from "@/app/data/api";
import { toast } from "sonner";
import { ArrowLeftIcon, Loader2Icon, CheckIcon, ShieldOffIcon, Trash2Icon } from "lucide-react";
import { ClarityLoader } from "@/components/ui/clarity-loader";
import { analytics } from "@/lib/mixpanel";
import { Button } from "@/components/ui/button";
import { InstallCard } from "@/app/components/pwa/install-card";
import { usePwaInstall } from "@/hooks/use-pwa-install";

export function SettingsPage() {
  const navigate = useNavigate();
  const { user, session, isLoading: authLoading, refreshProfile, signOut } = useAuth();
  const { isDesktop } = usePwaInstall();

  // Form state
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [bio, setBio] = useState("");
  const [reason, setReason] = useState("");

  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [showWithdrawConfirm, setShowWithdrawConfirm] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  // P520: account deletion
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
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

  // P520: typed-name confirmation, then one RPC, then a LOCAL sign-out (the server
  // session is already gone) and out. The confirm button is never rendered disabled —
  // a mismatch is a state the user can see and fix, not a dead control (P955).
  const handleDeleteAccount = async () => {
    if (!user) return;
    if (deleteConfirmName.trim() !== user.name.trim()) {
      setDeleteError("Type your name exactly as shown to confirm.");
      return;
    }
    setDeleteError(null);
    setIsDeleting(true);

    const { error } = await eraseMyAccount();
    if (error) {
      // The RPC is one transaction: an error means nothing was erased.
      toast.error("Couldn't delete your account — nothing was changed. Please try again.");
      setIsDeleting(false);
      return;
    }

    analytics.track('account_deleted');
    await signOut({ scope: 'local' });
    toast.success("Your account has been deleted.");
    navigate("/");
  };

  // Show loading state while checking auth
  if (authLoading) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-2xl">
        <div className="flex items-center justify-center">
          <ClarityLoader size="lg" />
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

      {/* P493: PWA install card — mobile only */}
      {!isDesktop && (
        <div className="mb-8">
          <h2 className="text-sm font-medium mb-3 text-muted-foreground">App</h2>
          <InstallCard />
        </div>
      )}

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
            <span className="text-xs text-muted-foreground">Paste URLs or write <code className="text-xs bg-muted px-1 py-0.5 rounded">[click here](https://...)</code> for named links</span>
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

      {/* P524: Pledge management */}
      <div className="mt-12 pt-8 border-t border-border">
        <h2 className="text-sm font-medium mb-3 text-muted-foreground">Pledge</h2>

        {user?.hasPledged ? (
          <div>
            {!showWithdrawConfirm ? (
              <button
                onClick={() => setShowWithdrawConfirm(true)}
                className="text-sm text-muted-foreground hover:text-destructive transition-colors"
              >
                Withdraw my pledge
              </button>
            ) : (
              <div className="rounded-lg border border-border p-4 space-y-3">
                <p className="text-sm">
                  Your pledge will be removed and you won&apos;t appear on the pledgers page.
                  Your account and all your content stay. You can re-take the pledge anytime.
                </p>
                <div className="flex gap-3">
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={isWithdrawing}
                    onClick={async () => {
                      if (!user?.id) return;
                      setIsWithdrawing(true);
                      // P880: has_pledged is server-controlled — route withdrawal through
                      // set_my_pledge(false) (a false transition always succeeds for the owner).
                      const { error } = await setMyPledge(false);
                      if (error) {
                        toast.error("Failed to withdraw pledge. Please try again.");
                        setIsWithdrawing(false);
                        return;
                      }
                      await refreshProfile();
                      analytics.track('pledge_withdrawn', { profile_slug: user.slug });
                      toast.success("Pledge withdrawn.");
                      setShowWithdrawConfirm(false);
                      setIsWithdrawing(false);
                    }}
                  >
                    {isWithdrawing ? (
                      <><Loader2Icon className="w-3 h-3 animate-spin" /> Withdrawing...</>
                    ) : (
                      <><ShieldOffIcon className="w-3 h-3" /> Withdraw pledge</>
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowWithdrawConfirm(false)}
                    disabled={isWithdrawing}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm">
            <span className="text-muted-foreground">You don&apos;t have an active pledge. </span>
            <Link to="/sign-pledge" className="text-primary hover:underline">
              Take the Clarity Pledge
            </Link>
          </div>
        )}
      </div>

      {/* P520: Account deletion */}
      <div className="mt-12 pt-8 border-t border-border">
        <h2 className="text-sm font-medium mb-3 text-muted-foreground">Account</h2>

        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="text-sm text-muted-foreground hover:text-destructive transition-colors"
          >
            Delete my account
          </button>
        ) : (
          <div className="rounded-lg border border-destructive/40 p-4 space-y-4">
            <p className="text-sm font-medium">Delete your account?</p>
            <div className="text-sm text-muted-foreground space-y-2">
              <p>This happens immediately and can&apos;t be undone.</p>
              <p>
                <span className="font-medium text-foreground">Erased:</span> your profile, your
                stories and positions, endorsements you received, event registrations, letters
                you sent, and your login. Your name is removed from sessions and agreements you
                shared with others.
              </p>
              <p>
                <span className="font-medium text-foreground">Kept, without your name:</span> points
                you created and events you hosted stay for the people who use them, shown as
                &ldquo;Deleted user&rdquo;.
              </p>
              <p>You can sign up again later with the same email.</p>
            </div>

            <div>
              <label htmlFor="delete-confirm-name" className="block text-sm font-medium mb-2">
                Type your name to confirm:{" "}
                <span className="font-normal text-muted-foreground">{user?.name}</span>
              </label>
              <input
                id="delete-confirm-name"
                type="text"
                value={deleteConfirmName}
                onChange={(e) => {
                  setDeleteConfirmName(e.target.value);
                  if (deleteError) setDeleteError(null);
                }}
                autoComplete="off"
                aria-describedby={deleteError ? "delete-confirm-error" : undefined}
                aria-invalid={deleteError ? "true" : undefined}
                className={`w-full px-4 py-3 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring ${
                  deleteError ? "border-red-500" : "border-input"
                }`}
                placeholder={user?.name}
              />
              {deleteError && (
                <p id="delete-confirm-error" className="text-sm text-red-500 mt-1" role="alert">
                  {deleteError}
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <Button
                variant="destructive"
                className="min-h-10"
                disabled={isDeleting}
                onClick={handleDeleteAccount}
              >
                {isDeleting ? (
                  <><Loader2Icon className="w-4 h-4 animate-spin" /> Deleting...</>
                ) : (
                  <><Trash2Icon className="w-4 h-4" /> Delete my account</>
                )}
              </Button>
              <Button
                variant="ghost"
                className="min-h-10"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteConfirmName("");
                  setDeleteError(null);
                }}
                disabled={isDeleting}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
