/**
 * @file login-page.tsx
 * @description This page provides a simple interface for existing users to log in.
 * It features a form where users can enter their email to receive a magic link,
 * which is the primary method of authentication.
 * This page is essential for returning users who want to access their dashboard,
 * manage their pledge, or view their profile.
 * It's a straightforward, single-purpose page designed to get users authenticated quickly.
 */
import { LoginForm } from "@/polymet/components/login-form";

export function LoginPage() {
  return (
    <div className="container mx-auto px-4 py-8 md:py-12 max-w-lg">
      <div className="bg-card border border-border rounded-lg shadow-sm p-6 md:p-8">
        <h1 className="text-2xl md:text-3xl font-bold text-center mb-2">Welcome Back</h1>
        <p className="text-muted-foreground text-center mb-8">
          Enter your email to access your pledge profile
        </p>
        <LoginForm onSwitchToSign={() => window.location.href = '/sign-pledge'} />
      </div>
    </div>
  );
}

