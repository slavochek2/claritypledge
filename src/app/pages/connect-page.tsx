/**
 * @file connect-page.tsx
 * @description P1556: /connect/:token — someone opened a personal contact code (by scanning it or from a sent link).
 *   Signed in: the chat with the code's owner starts or reopens, and this page replaces itself with it.
 *   Signed out: who the code belongs to, then the existing sign-up and log-in, which return here to finish.
 *   A code that does not work says so BEFORE sign-up, with one message for every reason (bad, reset, blocked).
 *
 * The token is a bearer secret in the URL (like a room code, P1304): session recording stops, Sentry and Mixpanel
 * redact `/connect/<token>` (url-token-redaction.ts, index.html), and this page sends no referrer.
 * Every rule is on the server; this page never turns a token into a profile id.
 */
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/auth";
import { analytics } from "@/lib/mixpanel";
import { ClarityPageLoader } from "@/components/ui/clarity-loader";
import { GravatarAvatar } from "@/components/ui/gravatar-avatar";
import { GoogleAuthButton } from "@/app/components/auth/google-auth-button";
import { chatPath } from "@/app/pages/chat/chat-view-model";
import {
  lookupContactCode,
  redeemContactCode,
  type CodeOwner,
  type RedeemFailure,
} from "@/app/data/contact-code-service";
import {
  CONTACT_CODE_PATH,
  isContactToken,
} from "@/app/data/contact-code-utils";

// [FOUNDER DECISION: copy] — every string below is a placeholder.
const COPY = {
  notWorking: "This code no longer works",
  notWorkingHint: "Ask them to show you their code again.",
  paused: "This code is paused until tomorrow",
  pausedHint:
    // A reset does not lift the owner's daily limit, so this must not suggest a new code (Opus review 2).
    "Too many people opened it today. Try again tomorrow.",
  tooMany: "You have started a lot of new chats today",
  tooManyHint: "Try again tomorrow.",
  failed: "Something went wrong",
  failedHint: "Check your connection and try again.",
  signUpLine: (first: string) =>
    `Create a free account to message ${first}. You'll go straight to your chat.`,
  useEmail: "Use email",
  haveAccount: "I have an account",
  retry: "Try again",
};

type View =
  | { kind: "loading" }
  | { kind: "owner"; owner: CodeOwner }
  | { kind: "refused"; reason: RedeemFailure | "failed" };

/** Keeps the token out of the Referer header of anything this page loads or links to. */
function useNoReferrer() {
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "referrer";
    meta.content = "no-referrer";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);
}

export function ConnectPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user, isLoading: authLoading, sessionChecked } = useAuth();
  const [view, setView] = useState<View>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const started = useRef<string | null>(null);

  useNoReferrer();
  useEffect(() => {
    analytics.stopSessionRecording();
  }, []);

  useEffect(() => {
    if (!sessionChecked || authLoading) return;
    if (!isContactToken(token)) {
      setView({ kind: "refused", reason: "unavailable" });
      return;
    }
    // One run per (token, account, attempt): React's double effect in dev must not redeem twice. A result applies
    // while its key is still the latest one; NOT tied to this effect's cleanup, because the re-run that the guard
    // skips would otherwise discard the only request and leave the loader up for ever.
    const key = `${token}:${user?.id ?? "anon"}:${attempt}`;
    if (started.current === key) return;
    started.current = key;
    const isLatest = () => started.current === key;

    if (user) {
      redeemContactCode(token).then(
        (result) => {
          if (!isLatest()) return;
          if (result.ok)
            navigate(chatPath(result.conversationId), { replace: true });
          else if (result.reason === "own-code")
            navigate("/me", { replace: true });
          else setView({ kind: "refused", reason: result.reason });
        },
        () => isLatest() && setView({ kind: "refused", reason: "failed" }),
      );
    } else {
      lookupContactCode(token).then(
        (owner) =>
          isLatest() &&
          setView(
            owner
              ? { kind: "owner", owner }
              : { kind: "refused", reason: "unavailable" },
          ),
        () => isLatest() && setView({ kind: "refused", reason: "failed" }),
      );
    }
  }, [token, user, authLoading, sessionChecked, attempt, navigate]);

  if (view.kind === "loading") return <ClarityPageLoader />;

  if (view.kind === "refused") {
    const [title, hint] =
      view.reason === "paused"
        ? [COPY.paused, COPY.pausedHint]
        : view.reason === "too-many"
          ? [COPY.tooMany, COPY.tooManyHint]
          : view.reason === "failed"
            ? [COPY.failed, COPY.failedHint]
            : [COPY.notWorking, COPY.notWorkingHint];
    return (
      <main
        className="mx-auto flex max-w-sm flex-col items-center gap-3 px-6 py-16 text-center"
        data-testid="connect-refused"
        data-reason={view.reason}
      >
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">{hint}</p>
        {view.reason === "failed" && (
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="min-h-11 rounded-full border px-5 text-sm font-medium"
          >
            {COPY.retry}
          </button>
        )}
      </main>
    );
  }

  const { owner } = view;
  const first = owner.name.trim().split(/\s+/)[0] || owner.name;
  const back = `${CONTACT_CODE_PATH}/${token}`;
  const redirect = encodeURIComponent(back);
  return (
    <main
      className="mx-auto flex max-w-sm flex-col items-center gap-4 px-6 py-12 text-center"
      data-testid="connect-owner"
    >
      <GravatarAvatar
        name={owner.name}
        photoUrl={owner.avatarUrl ?? undefined}
        avatarColor={owner.avatarColor ?? undefined}
        isPledger={false}
        size="xl"
      />
      <h1 className="text-xl font-semibold">{owner.name}</h1>
      <p className="text-sm text-muted-foreground">{COPY.signUpLine(first)}</p>
      <div className="flex w-full flex-col gap-3 pt-4">
        <GoogleAuthButton
          context="connect-code"
          source="signup"
          redirect={back}
        />
        <Link
          to={`/signup?redirect=${redirect}`}
          className="flex min-h-11 items-center justify-center rounded-md border text-sm font-medium"
        >
          {COPY.useEmail}
        </Link>
        <Link
          to={`/login?redirect=${redirect}`}
          className="flex min-h-11 items-center justify-center text-sm font-medium text-blue-600"
        >
          {COPY.haveAccount}
        </Link>
      </div>
    </main>
  );
}
