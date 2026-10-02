import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { reportUnlessBlip } from '@/lib/report-unless-blip';
import { useAuth } from '@/auth/AuthContext';
import { needsTermsAcceptance, recordTermsAcceptance } from '@/app/data/api';
import { TermsUpdateDialog } from '@/app/components/live-meeting/terms-update-dialog';
import { TermsNoticeBanner } from '@/app/components/legal/terms-notice-banner';
import { CURRENT_TERMS_VERSION } from '@/lib/constants';
import { TERMS_CHANGES } from '@/app/content/terms-changes';
import { analytics } from '@/lib/mixpanel';

interface TermsAcceptanceGateProps {
  children: ReactNode;
}

// Paths where the gate must stay dormant. /auth/* is the OAuth landing where
// the profile row is being created/updated — firing the gate there races with
// the upsert and can flash the modal on top of a callback page that's about
// to navigate away.
const GATE_EXEMPT_PREFIXES = ['/auth/'];

// The two legal documents are the pages the modal links and asks the user to
// accept (P1300). The user opening one is the same stale-terms user, so without
// this exemption the modal re-opens over the very text they are trying to read.
// The gate overlays rather than blocks rendering, so exempting changes what the
// user can read, not what is processed. Exact routes, not prefixes: a look-alike
// such as /privacy-policy-preview must stay gated.
const GATE_EXEMPT_EXACT_PATHS = ['/terms-of-service', '/privacy-policy'];

// Blocking popup only when the current version needs fresh consent. A version
// with no summary entry also blocks: the safe side when nobody decided.
const GATE_MODE: 'block' | 'notice' =
  TERMS_CHANGES[CURRENT_TERMS_VERSION]?.requiresConsent === false ? 'notice' : 'block';

function reportAcceptFailure(err: unknown) {
  reportUnlessBlip(err, {
    context: 'terms-acceptance-gate',
    tags: { area: 'terms-acceptance-gate' },
  });
}

function isGateExempt(pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  return (
    GATE_EXEMPT_PREFIXES.some((p) => pathname.startsWith(p)) ||
    GATE_EXEMPT_EXACT_PATHS.includes(normalized)
  );
}

export function TermsAcceptanceGate({ children }: TermsAcceptanceGateProps) {
  const { user, isLoading, signOut } = useAuth();
  const location = useLocation();
  const [showDialog, setShowDialog] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const gateShownTrackedRef = useRef<string | null>(null);

  const isExemptPath = isGateExempt(location.pathname);

  useEffect(() => {
    // Once the dialog is open, only an explicit accept or signOut closes it.
    // Don't react to transient auth churn (session re-validation flips isLoading
    // back to true mid-flight) — that would make the modal disappear before the
    // user can act.
    if (isLoading || isExemptPath) return;
    if (!user) {
      setShowDialog(false);
      gateShownTrackedRef.current = null;
      return;
    }
    const userId = user.id;
    let cancelled = false;
    needsTermsAcceptance(userId).then((needs) => {
      // Guard against user-switch races: if the user changed while the query
      // was in flight, discard the result rather than apply it to the wrong user.
      if (!cancelled && needs && user.id === userId) {
        setShowDialog(true);
        if (gateShownTrackedRef.current !== userId) {
          gateShownTrackedRef.current = userId;
          analytics.track('tos_gate_shown', { terms_version: CURRENT_TERMS_VERSION, mode: GATE_MODE });
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user, isLoading, isExemptPath]);

  const handleAccept = async () => {
    if (!user) return;
    setIsAccepting(true);
    setAcceptError(null);
    try {
      await recordTermsAcceptance(user.id);
      analytics.track('tos_accepted', { terms_version: CURRENT_TERMS_VERSION, mode: GATE_MODE });
      setShowDialog(false);
    } catch (err) {
      reportAcceptFailure(err);
      setAcceptError(
        'Could not save your acceptance. Check your connection and try again.'
      );
    } finally {
      setIsAccepting(false);
    }
  };

  // Notice mode: dismissing records acceptance (continued use). If saving fails,
  // hide it anyway for this page load rather than trap the user in a banner; it
  // returns on the next load because the stored version is still behind.
  const handleDismissNotice = async () => {
    if (!user) return;
    setIsAccepting(true);
    try {
      await recordTermsAcceptance(user.id, 'notice');
      analytics.track('tos_accepted', { terms_version: CURRENT_TERMS_VERSION, mode: GATE_MODE });
    } catch (err) {
      reportAcceptFailure(err);
    } finally {
      setIsAccepting(false);
      setShowDialog(false);
    }
  };

  // Sign out first, then let the effect drop the dialog when `user` flips null.
  // Doing the dialog flip up front would re-render children with an authed user
  // for the duration of the signOut round-trip.
  const handleCancel = async () => {
    await signOut();
  };

  return (
    <>
      {children}
      {GATE_MODE === 'notice' && showDialog && (
        <TermsNoticeBanner onDismiss={handleDismissNotice} isLoading={isAccepting} />
      )}
      <TermsUpdateDialog
        open={GATE_MODE === 'block' && showDialog}
        onAccept={handleAccept}
        onCancel={handleCancel}
        isLoading={isAccepting}
        dismissible={false}
        errorMessage={acceptError}
        cancelLabel="Decline and log out"
      />
    </>
  );
}
