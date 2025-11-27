import { SignPledgeForm } from "@/polymet/components/sign-pledge-form";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export function SignPledgePage() {
  const navigate = useNavigate();

  const handleSuccess = () => {
    // Check if this is a returning user
    const returningUserInfo = localStorage.getItem('returningUserInfo');

    if (returningUserInfo) {
      try {
        const { name } = JSON.parse(returningUserInfo);
        toast.success(`Welcome back, ${name}! We've sent you a login link to access your profile.`);
        localStorage.removeItem('returningUserInfo'); // Clean up
      } catch {
        // Fallback if parsing fails
        toast.success("Welcome back! We've sent you a login link to access your profile.");
      }
    } else {
      // New user
      toast.success("Thank you for signing! Please check your email to seal your pledge.");
    }

    navigate("/");
  };

  return (
    <div className="container mx-auto px-4 py-8 md:py-12 max-w-3xl">
      <div className="mb-8 text-center">
        <h1 className="text-3xl md:text-4xl font-serif font-bold mb-4">Take the Pledge</h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Join others in committing to clarity and understanding.
        </p>
      </div>
      <SignPledgeForm
        onSuccess={handleSuccess}
        onSwitchToLogin={() => navigate('/login')}
      />
    </div>
  );
}

