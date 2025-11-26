import { ReactNode, useState } from "react";
import { useLocation } from "react-router-dom";
import { ClarityNavigation } from "@/polymet/components/clarity-navigation";
import { PledgeModal } from "@/polymet/components/pledge-modal";

interface ClarityLandingLayoutProps {
  children: ReactNode;
}

export function ClarityLandingLayout({ children }: ClarityLandingLayoutProps) {
  const [isPledgeModalOpen, setIsPledgeModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"sign" | "login">("sign");
  const location = useLocation();

  // Don't show navigation on landing page (it has its own)
  const isLandingPage = location.pathname === "/";

  return (
    <div className="min-h-screen bg-background text-foreground">
      {!isLandingPage && (
        <ClarityNavigation
          onTakePledge={() => {
            setModalMode("sign");
            setIsPledgeModalOpen(true);
          }}
          onSignIn={() => {
            setModalMode("login");
            setIsPledgeModalOpen(true);
          }}
        />
      )}
      <main className={!isLandingPage ? "pt-16 lg:pt-20" : ""}>{children}</main>

      {!isLandingPage && (
        <PledgeModal
          open={isPledgeModalOpen}
          onOpenChange={setIsPledgeModalOpen}
          initialMode={modalMode}
        />
      )}
    </div>
  );
}
