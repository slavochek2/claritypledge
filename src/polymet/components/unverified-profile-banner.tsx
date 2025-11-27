import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { useState } from "react";
import { toast } from "sonner";

interface UnverifiedProfileBannerProps {
  email: string;
}

export function UnverifiedProfileBanner({ email }: UnverifiedProfileBannerProps) {
  const [isSending, setIsSending] = useState(false);

  const handleResend = async () => {
    setIsSending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email,
      });
      if (error) {
        toast.error("Failed to resend verification email.");
        console.error(error);
      } else {
        toast.success("Verification email sent!");
      }
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 text-center" role="alert">
      <p className="font-bold">Your pledge is not yet public.</p>
      <p>Please check your email to verify your account and activate your shareable link.</p>
      <Button onClick={handleResend} disabled={isSending} className="mt-2">
        {isSending ? "Sending..." : "Resend Verification Email"}
      </Button>
    </div>
  );
}
