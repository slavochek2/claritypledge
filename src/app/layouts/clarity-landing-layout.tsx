import { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { SimpleNavigation } from "@/app/components/layout/simple-navigation";
import { OfflineBanner } from "@/app/components/offline-banner";
import { Toaster } from "@/components/ui/sonner";

interface ClarityLandingLayoutProps {
  children: ReactNode;
}

export function ClarityLandingLayout({ children }: ClarityLandingLayoutProps) {
  const location = useLocation();

  // Don't show navigation on pages that have their own navigation
  const isLandingPage = location.pathname === "/";
  const isAlternativeLandingPage = location.pathname === "/alternative";
  const isFullArticlePage = location.pathname === "/article" || location.pathname === "/manifesto";
  const hasOwnNavigation = isLandingPage || isAlternativeLandingPage || isFullArticlePage;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <OfflineBanner />
      {!hasOwnNavigation && (
        <SimpleNavigation />
      )}
      <main className={!hasOwnNavigation ? "pt-16 lg:pt-20" : ""}>{children}</main>
      <Toaster position="top-center" />
    </div>
  );
}
