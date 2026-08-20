/**
 * @file guest-or-account-join.tsx
 * @description P1114: the two-door join pattern extracted from `clarity-live-page.tsx`
 * (P396's guest join form) so `/live` and the event room render the SAME markup instead
 * of the room reinventing it. Presentation only — every behavior (validation, submit
 * handler, consent flow, auto-join) stays with the caller and is passed in as props.
 *
 * Copy is verbatim, unchanged from what `/live` has shipped — "What should we call
 * me?", "Enter your name", "Join as Guest", "or join as guest", "Log in with email".
 * This is moved wording, not new wording, so it is exempt from the
 * `[FOUNDER DECISION]` placeholder rule that governs new room copy.
 */
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { GoogleAuthButton } from '@/app/components/auth/google-auth-button';

export interface GuestOrAccountJoinProps {
  /** Current value of the guest name field. */
  name: string;
  onNameChange: (value: string) => void;
  /** Invoked with the trimmed-by-caller name on "Join as Guest". The component does
   * no validation itself — it defers entirely to the caller, matching both existing
   * callers' own validation (`validateName` on /live, a trim+required check in the
   * room). */
  onGuestSubmit: () => void;
  /** True while a guest-join request is in flight. Swaps the button label to
   * "Joining…" and disables it, same as /live's `isLoading || consentLoading`. */
  submitting: boolean;
  /** Extra condition to keep the submit button disabled beyond `submitting` — e.g.
   * /live's `!canJoinViaLink`. Defaults to false (no extra gate). */
  submitDisabled?: boolean;
  /** Inline error shown above the submit button (e.g. "Enter a name to join."). */
  error?: string | null;
  /** `GoogleAuthButton`'s analytics context — distinct per caller ("live-join" vs
   * "event-room"). */
  googleContext: string;
  googleSource?: 'login' | 'signup' | 'pledge';
  /** Passed straight through to `GoogleAuthButton` and the "Log in with email" link. */
  redirect?: string;
  /** `to` target for "Log in with email" (react-router) — /live appends its
   * redirect query param, the room does not. */
  loginHref: string;
}

/**
 * The two-door join UI: Google sign-in / "Log in with email" above a divider, guest
 * name field + "Join as Guest" below. Renders identically wherever it's used. P1114
 * extracted this out of clarity-live-page.tsx; the event room does NOT reuse it as
 * of revision 2 (registration + sign-in gates the room instead — see
 * `features/p1114_event_room_presence_and_cmp_opt_in.md`, Solution "REVISED (2)").
 */
export function GuestOrAccountJoin({
  name,
  onNameChange,
  onGuestSubmit,
  submitting,
  submitDisabled = false,
  error,
  googleContext,
  googleSource,
  redirect,
  loginHref,
}: GuestOrAccountJoinProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <GoogleAuthButton context={googleContext} source={googleSource} redirect={redirect} />
        <div className="text-center">
          <Link
            to={loginHref}
            className="text-sm text-blue-600 hover:text-blue-700 underline underline-offset-2"
          >
            Log in with email
          </Link>
        </div>
      </div>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">or join as guest</span>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="guest-name">What should we call you?</Label>
        <Input
          id="guest-name"
          placeholder="Enter your name"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          autoFocus
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button
        onClick={onGuestSubmit}
        disabled={submitting || submitDisabled}
        className="w-full bg-blue-500 hover:bg-blue-600"
        size="lg"
      >
        {submitting ? 'Joining...' : 'Join as Guest'}
      </Button>
    </div>
  );
}
