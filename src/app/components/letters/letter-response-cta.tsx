/**
 * End-of-letter CTA block for unauthenticated readers on one-to-many letters.
 * Replaces the old inline signup form with a Google + email signup flow.
 * Draft is stored in sessionStorage before any navigation; the confirm page reads it.
 */

import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { GoogleAuthButton } from '@/app/components/auth/google-auth-button';

interface LetterResponseCTAProps {
  senderName: string;
  letterId: string;
}

export function LetterResponseCTA({ senderName, letterId }: LetterResponseCTAProps) {
  const confirmRedirect = `/letter/${letterId}/confirm`;

  return (
    <div className="border border-border bg-muted/50 rounded-md p-4 md:p-5 space-y-4 mt-8 mb-4">
      <h3 className="text-base font-semibold text-foreground">Save your responses</h3>
      <p className="text-sm text-muted-foreground">
        Create an account so {senderName} can see your ratings — and you can come back to future letters.
      </p>

      <GoogleAuthButton
        context="letter-response"
        source="signup"
        redirect={confirmRedirect}
        action="confirm-letter-response"
        extraParams={{ letterId }}
      />

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-muted/50 px-2 text-muted-foreground">or use email</span>
        </div>
      </div>

      <Button variant="default" size="lg" className="w-full min-h-[44px]" asChild>
        <Link
          to={`/signup?source=letter-response&letterId=${letterId}&redirect=${encodeURIComponent(confirmRedirect)}`}
        >
          Sign up with email
        </Link>
      </Button>

      <div className="text-center">
        <Link
          to={`/login?redirect=${encodeURIComponent(`/letter/${letterId}`)}`}
          className="text-sm text-muted-foreground hover:text-foreground underline"
        >
          Already have an account? Log in
        </Link>
      </div>
    </div>
  );
}
