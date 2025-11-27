import { Button } from "@/components/ui/button";
import { usePledgeModal } from "@/polymet/contexts/pledge-modal-context";

export function GuestMenu() {
  const { open } = usePledgeModal();

  return (
    <>
      <Button
        onClick={() => open("login")}
        variant="ghost"
        className="text-base font-medium hover:text-primary transition-colors"
      >
        Log In
      </Button>
      <Button
        onClick={() => open("sign")}
        size="lg"
        className="bg-blue-500 hover:bg-blue-600 text-white font-semibold"
      >
        Take the Pledge
      </Button>
    </>
  );
}

