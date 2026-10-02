import { TermsUpdateDialog } from '@/app/components/live-meeting/terms-update-dialog';
import { TermsNoticeBanner } from '@/app/components/legal/terms-notice-banner';

// P955 gate fixture: the real terms-update UI as the global gate shows it.
// ?phase=notice → dismissible banner; default → blocking popup.
export function GateFixture() {
  const phase = new URLSearchParams(window.location.search).get('phase');
  if (phase === 'notice') return <TermsNoticeBanner onDismiss={() => {}} />;
  return <TermsUpdateDialog open onAccept={() => {}} onCancel={() => {}} dismissible={false} cancelLabel="Decline and log out" />;
}
