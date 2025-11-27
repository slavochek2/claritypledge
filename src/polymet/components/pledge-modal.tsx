import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SignPledgeForm } from "@/polymet/components/sign-pledge-form";
import { LoginForm } from "@/polymet/components/login-form";
import { toast } from "sonner";

interface PledgeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMode?: "sign" | "login";
}

export function PledgeModal({
  open,
  onOpenChange,
  initialMode = "sign",
}: PledgeModalProps) {
  const [mode, setMode] = useState<"sign" | "login">(initialMode);
  const navigate = useNavigate();

  // Update mode when initialMode changes
  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  const handleSignSuccess = () => {
    onOpenChange(false);
    toast.success("Thank you for signing! Please check your email to seal your pledge.");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-[#F5F5F0] border-none shadow-2xl p-4 md:p-8">
        {mode === "sign" ? (
          <div>
            <DialogHeader className="sr-only">
              <DialogTitle>Sign the Clarity Pledge</DialogTitle>
              <DialogDescription>
                Fill out the form below to take the pledge.
              </DialogDescription>
            </DialogHeader>
            <SignPledgeForm
              onSuccess={handleSignSuccess}
              onSwitchToLogin={() => setMode("login")}
            />
          </div>
        ) : (
          <div>
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold">
                Log In to Your Pledge
              </DialogTitle>
              <DialogDescription className="text-base">
                We'll send you a magic link to access your profile
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4">
              <LoginForm onSwitchToSign={() => setMode("sign")} />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
