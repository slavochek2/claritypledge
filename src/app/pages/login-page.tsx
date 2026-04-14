/**
 * @file login-page.tsx
 * @description This page provides a simple interface for existing users to log in.
 * It features a form where users can enter their email to receive a magic link,
 * which is the primary method of authentication.
 * This page is essential for returning users who want to access their dashboard,
 * manage their pledge, or view their profile.
 * It's a straightforward, single-purpose page designed to get users authenticated quickly.
 */
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { LoginForm } from "@/app/components/pledge/login-form";
import { analytics } from "@/lib/mixpanel";
import { useAuth } from "@/auth/AuthContext";

export function LoginPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, sessionChecked, isLoading } = useAuth();

  // Already logged in → bounce out of /login
  useEffect(() => {
    if (!sessionChecked || isLoading) return;
    if (user) {
      const redirectParam = new URLSearchParams(location.search).get('redirect');
      const safeRedirect =
        redirectParam && !redirectParam.startsWith('/login') && !redirectParam.startsWith('/signup')
          ? redirectParam
          : (user.slug ? `/p/${user.slug}` : '/');
      navigate(safeRedirect, { replace: true });
    }
  }, [user, sessionChecked, isLoading, navigate, location.search]);

  // P76: Read redirect and action params for post-auth navigation
  const searchParams = new URLSearchParams(location.search);
  const redirectParam = searchParams.get('redirect');
  const actionParam = searchParams.get('action');

  // P458: Collect auth-gate params to forward through login callback
  const authGateExtraParams: Record<string, string> = {};
  for (const key of ['pointId', 'position', 'pointTitle']) {
    const val = searchParams.get(key);
    if (val) authGateExtraParams[key] = val;
  }

  useEffect(() => {
    analytics.track('login_page_viewed', {
      referrer: document.referrer || 'direct',
    });
  }, []);

  // P76: Preserve URL params when switching to signup
  const handleSwitchToSignup = () => {
    window.location.href = `/signup${location.search}`;
  };

  return (
    <div className="container mx-auto px-4 py-8 md:py-12 max-w-lg">
      <div className="bg-card border border-border rounded-lg shadow-sm p-6 md:p-8">
        <h1 className="text-2xl md:text-3xl font-bold text-center mb-2">Welcome Back</h1>
        <p className="text-muted-foreground text-center mb-8">
          Enter your email to access your pledge profile
        </p>
        <LoginForm
          onSwitchToSign={handleSwitchToSignup}
          redirect={redirectParam || undefined}
          action={actionParam || undefined}
          extraParams={Object.keys(authGateExtraParams).length > 0 ? authGateExtraParams : undefined}
        />
      </div>
    </div>
  );
}

