import { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { SimpleNavigation } from "@/app/components/layout/simple-navigation";
import { LegalFooter } from "@/app/components/layout/legal-footer";
import { ClarityFooter } from "@/app/components/layout/clarity-footer";
import { OfflineBanner } from "@/app/components/offline-banner";
import { Toaster } from "@/components/ui/sonner";

interface ClarityLandingLayoutProps {
  children: ReactNode;
}

export function ClarityLandingLayout({ children }: ClarityLandingLayoutProps) {
  const location = useLocation();

  const isLandingPage = location.pathname === "/";
  const isAlternativeLandingPage = location.pathname === "/alternative";
  // Live meeting pages have their own header (LiveSessionBanner)
  const isLiveMeetingPage = location.pathname === "/live" || location.pathname.startsWith("/live/");
  // Pages that have their own navigation (skip layout nav)
  const hasOwnNavigation = isAlternativeLandingPage || isLiveMeetingPage;
  // Landing page needs nav but no top padding (hero goes to top)
  const needsTopPadding = !hasOwnNavigation && !isLandingPage;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <OfflineBanner />
      {!hasOwnNavigation && (
        <SimpleNavigation />
      )}
      <main className={needsTopPadding ? "pt-16 lg:pt-20 flex-1" : "flex-1"}>{children}</main>
      {isLandingPage ? <ClarityFooter /> : <LegalFooter />}
      <Toaster position="top-center" />
    </div>
  );
}
