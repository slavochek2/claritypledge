/**
 * @file simple-navigation.tsx
 * @description KISS Navigation - Two states only
 *
 * 1. Verified user → Full menu (View My Profile, pledge items, Settings, Log Out)
 * 2. Everyone else → Public menu (Log In)
 */
import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MenuIcon, XIcon, LogOutIcon, EyeIcon, SettingsIcon, UserIcon, FileTextIcon } from "lucide-react";
import { ClarityLogo } from "@/components/ui/clarity-logo";
import { NAV_LINKS } from "./nav-links";
import { analytics } from "@/lib/mixpanel";
import { useNavAuthState } from "@/hooks/use-nav-auth-state";
import { NavigationMenuItems } from "./navigation-menu-items";

const MOBILE_MENU_ID = "mobile-navigation-menu";

export function SimpleNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // KISS: Only two states - verified user or everyone else
  const {
    showUserMenu,
    showPublicCTAs,
    hasPledged,
    slug,
    sessionChecked,
    signOut,
  } = useNavAuthState();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut();
      setIsMobileMenuOpen(false);
      navigate("/");
    } catch {
      setIsMobileMenuOpen(false);
    }
  };

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? "bg-background/95 backdrop-blur-md border-b border-border shadow-sm"
          : "bg-background/80 backdrop-blur-sm"
      }`}
    >
      <div className="container mx-auto px-4 lg:px-8">
        <div className="relative flex items-center justify-between h-16 lg:h-20">
          {/* Logo */}
          <Link
            to="/"
            className="hover:opacity-80 transition-opacity"
            onClick={(e) => {
              if (location.pathname === "/") {
                e.preventDefault();
                window.scrollTo({ top: 0, behavior: "smooth" });
              }
            }}
          >
            <ClarityLogo size="sm" />
          </Link>

          {/* Desktop: CTAs + Menu */}
          <div className="hidden lg:flex items-center gap-3">
            {/* Take the Pledge CTA - hide for verified pledgers */}
            {sessionChecked && (!showUserMenu || !hasPledged) && (
              <Link
                to="/sign-pledge"
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring h-10 rounded-md px-6 border border-input bg-background hover:bg-accent font-medium"
                onClick={() => analytics.track('nav_cta_clicked', { cta: 'take_pledge', device: 'desktop' })}
              >
                Take the Pledge
              </Link>
            )}
            {/* Try a Clarity Meeting CTA */}
            <Link
              to="/live"
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring shadow h-10 rounded-md px-8 bg-blue-500 hover:bg-blue-600 text-white font-semibold"
              onClick={() => analytics.track('nav_cta_clicked', { cta: 'try_meeting', device: 'desktop' })}
            >
              Try a Clarity Meeting
            </Link>
            {/* Hamburger Menu */}
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center justify-center hover:bg-accent transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-md p-2"
                  aria-label="Menu"
                >
                  <MenuIcon className="w-5 h-5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={8} className="w-48">
                {/* Nav Links */}
                {NAV_LINKS.map((link) => (
                  <DropdownMenuItem key={link.to} asChild>
                    <Link to={link.to} className="cursor-pointer">
                      {link.label}
                    </Link>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                {/* Auth Menu Items - KISS: Uses shared component */}
                <NavigationMenuItems onSignOut={handleSignOut} />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="lg:hidden p-2"
            aria-expanded={isMobileMenuOpen}
            aria-controls={MOBILE_MENU_ID}
            aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
          >
            {isMobileMenuOpen ? (
              <XIcon className="w-6 h-6" />
            ) : (
              <MenuIcon className="w-6 h-6" />
            )}
          </button>
        </div>

        {/* Mobile Menu - KISS: Same two-state logic */}
        {isMobileMenuOpen && (
          <div
            id={MOBILE_MENU_ID}
            className="lg:hidden py-4 pb-6 border-t border-border bg-background shadow-lg"
          >
            <div className="flex flex-col gap-3">
              {/* CTAs */}
              <Link
                to="/live"
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring shadow h-11 rounded-md px-8 bg-blue-500 hover:bg-blue-600 text-white font-semibold w-full"
                onClick={() => {
                  analytics.track('nav_cta_clicked', { cta: 'try_meeting', device: 'mobile' });
                  closeMobileMenu();
                }}
              >
                Try a Clarity Meeting
              </Link>
              {sessionChecked && (!showUserMenu || !hasPledged) && (
                <Link
                  to="/sign-pledge"
                  className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring h-11 rounded-md px-8 bg-muted hover:bg-accent font-medium w-full"
                  onClick={() => {
                    analytics.track('nav_cta_clicked', { cta: 'take_pledge', device: 'mobile' });
                    closeMobileMenu();
                  }}
                >
                  Take the Pledge
                </Link>
              )}

              <div className="border-t border-border my-2"></div>

              {/* Navigation Links */}
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className="text-left text-base font-medium hover:text-primary transition-colors py-2"
                  onClick={closeMobileMenu}
                >
                  {link.label}
                </Link>
              ))}

              <div className="border-t border-border my-2"></div>

              {/* KISS: Two states only */}
              {showPublicCTAs && (
                <Link
                  to="/login"
                  className="text-left text-base font-medium hover:text-primary transition-colors py-2"
                  onClick={closeMobileMenu}
                >
                  Log In
                </Link>
              )}

              {showUserMenu && (
                <>
                  <Link
                    to="/me"
                    className="text-left text-base font-medium hover:text-primary transition-colors py-2"
                    onClick={closeMobileMenu}
                  >
                    <UserIcon className="w-4 h-4 inline mr-2" />
                    View My Profile
                  </Link>
                  {hasPledged && slug ? (
                    <Link
                      to={`/p/${slug}/pledge`}
                      className="text-left text-base font-medium hover:text-primary transition-colors py-2"
                      onClick={closeMobileMenu}
                    >
                      <EyeIcon className="w-4 h-4 inline mr-2" />
                      View My Pledge
                    </Link>
                  ) : (
                    <Link
                      to="/sign-pledge?prefill=true"
                      className="text-left text-base font-medium hover:text-primary transition-colors py-2"
                      onClick={closeMobileMenu}
                    >
                      <FileTextIcon className="w-4 h-4 inline mr-2" />
                      Take the Pledge
                    </Link>
                  )}
                  <Link
                    to="/settings"
                    className="text-left text-base font-medium hover:text-primary transition-colors py-2"
                    onClick={closeMobileMenu}
                  >
                    <SettingsIcon className="w-4 h-4 inline mr-2" />
                    Settings
                  </Link>
                  <button
                    onClick={handleSignOut}
                    className="text-left text-base font-medium hover:text-primary transition-colors py-2"
                  >
                    <LogOutIcon className="w-4 h-4 inline mr-2" />
                    Log Out
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
