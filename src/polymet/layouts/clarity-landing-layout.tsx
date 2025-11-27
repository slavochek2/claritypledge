import { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { ClarityNavigation } from "@/polymet/components/clarity-navigation";

interface ClarityLandingLayoutProps {
  children: ReactNode;
}

export function ClarityLandingLayout({ children }: ClarityLandingLayoutProps) {
  const location = useLocation();

  // Don't show navigation on pages that have their own navigation
  const isLandingPage = location.pathname === "/";
  const isFullArticlePage = location.pathname === "/article" || location.pathname === "/manifesto";

  return (
    <div className="min-h-screen bg-background text-foreground">
      {!isLandingPage && !isFullArticlePage && (
        <ClarityNavigation />
      )}
      <main className={!isLandingPage && !isFullArticlePage ? "pt-16 lg:pt-20" : ""}>{children}</main>
    </div>
  );
}
