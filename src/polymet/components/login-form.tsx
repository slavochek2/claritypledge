import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2Icon, AlertCircleIcon } from "lucide-react";
import { signInWithEmail } from "@/polymet/data/api";

interface LoginFormProps {
  onSwitchToSign: () => void;
}

export function LoginForm({ onSwitchToSign }: LoginFormProps) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setIsSubmitting(true);
    setError("");

    try {
      const { error } = await signInWithEmail(email);

      if (error) {
        setError(error.message);
        setIsSubmitting(false);
      } else {
        // Magic link sent successfully
        setIsSubmitting(false);
        setIsSubmitted(true);
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="space-y-6 text-center">
        <div className="flex justify-center">
          <CheckCircle2Icon className="w-16 h-16 text-green-600" />
        </div>
        <div className="space-y-2">
          <h3 className="text-xl font-semibold">Check Your Email</h3>
          <p className="text-sm text-muted-foreground">
            We've sent a magic link to <strong>{email}</strong>
          </p>
          <p className="text-sm text-muted-foreground">
            Click the link in your email to access your profile.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => setIsSubmitted(false)}
          className="w-full"
        >
          Send Another Link
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="login-email" className="text-sm font-medium">
            Email Address
          </Label>
          <Input
            id="login-email"
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(""); // Clear error when typing
            }}
            required
            className="w-full"
          />

          {error && (
            <div className="flex items-start gap-2 text-sm text-destructive mt-2">
              <AlertCircleIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />

              <p>{error}</p>
            </div>
          )}
        </div>
      </div>

      <Button
        type="submit"
        className="w-full bg-[#0044CC] hover:bg-[#0033AA] text-white"
        size="lg"
        disabled={isSubmitting}
      >
        {isSubmitting ? "Sending..." : "Send Me a Magic Link"}
      </Button>

      <div className="text-center">
        <button
          type="button"
          onClick={onSwitchToSign}
          className="text-sm text-muted-foreground hover:text-foreground underline"
        >
          Don't have a pledge? Sign now
        </button>
      </div>
    </form>
  );
}
