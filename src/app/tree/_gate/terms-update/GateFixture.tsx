import { TermsUpdateDialog } from '@/app/components/live-meeting/terms-update-dialog';

// P955 gate fixture: the real re-acceptance popup, open, as the global terms gate shows it.
export function GateFixture() {
  return (
    <TermsUpdateDialog open onAccept={() => {}} onCancel={() => {}} dismissible={false} />
  );
}
