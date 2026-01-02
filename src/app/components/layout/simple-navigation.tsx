import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MenuIcon, XIcon, LogOutIcon, EyeIcon, SettingsIcon } from "lucide-react";
import { GravatarAvatar } from "@/components/ui/gravatar-avatar";
import { ClarityLogo } from "@/components/ui/clarity-logo";
import { NAV_LINKS } from "./nav-links";

const MOBILE_MENU_ID = "mobile-navigation-menu";

export function SimpleNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const { session, user: currentUser, isLoading, sessionChecked, signOut } = useAuth();

  // Auth state phases:
  // 1. sessionChecked=false → show nothing (checking session)
  // 2. sessionChecked=true, session=null → show public CTAs (not logged in)
  // 3. sessionChecked=true, session exists, isLoading=true → show nothing (profile loading)
  // 4. sessionChecked=true, session exists, isLoading=false, currentUser exists → show user menu

  // Show user menu only when BOTH session AND profile are loaded
  // This prevents the "?" avatar flash when session loads before profile
  const showUserMenu = sessionChecked && !isLoading && !!session && !!currentUser;

  // Show public CTAs only when session check done AND no session found
  // This prevents the "Log In" flash when page loads
  const showPublicCTAs = sessionChecked && !session;

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
      // Sign out failed - don't navigate, user is still logged in
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
            {/* Secondary CTA */}
            <Link
              to="/live"
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring h-10 rounded-md px-6 border border-input bg-background hover:bg-accent font-medium"
            >
              Try Meeting
            </Link>
            {/* Primary CTA */}
            <Link
              to="/sign-pledge"
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring shadow h-10 rounded-md px-8 bg-blue-500 hover:bg-blue-600 text-white font-semibold"
            >
              Take the Pledge
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
                {/* Auth Actions */}
                {showUserMenu && (
                  <>
                    <DropdownMenuItem asChild>
                      <Link
                        to={`/p/${currentUser.slug}`}
                        className="cursor-pointer"
                      >
                        <EyeIcon className="w-4 h-4 mr-2" />
                        View My Pledge
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/settings" className="cursor-pointer">
                        <SettingsIcon className="w-4 h-4 mr-2" />
                        Settings
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={handleSignOut}
                      className="cursor-pointer"
                    >
                      <LogOutIcon className="w-4 h-4 mr-2" />
                      Log Out
                    </DropdownMenuItem>
                  </>
                )}
                {showPublicCTAs && (
                  <DropdownMenuItem asChild>
                    <Link to="/login" className="cursor-pointer">
                      Log In
                    </Link>
                  </DropdownMenuItem>
                )}
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

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div
            id={MOBILE_MENU_ID}
            className="lg:hidden py-4 border-t border-border bg-background"
          >
            <div className="flex flex-col gap-3">
              {/* CTAs first - Primary then Secondary */}
              <Link
                to="/sign-pledge"
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring shadow h-11 rounded-md px-8 bg-blue-500 hover:bg-blue-600 text-white font-semibold w-full"
                onClick={closeMobileMenu}
              >
                Take the Pledge
              </Link>
              <Link
                to="/live"
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring h-11 rounded-md px-8 bg-muted hover:bg-accent font-medium w-full"
                onClick={closeMobileMenu}
              >
                Try Meeting
              </Link>

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

              {/* Auth Actions */}
              {showUserMenu && (
                <>
                  <Link
                    to={`/p/${currentUser.slug}`}
                    className="text-left text-base font-medium hover:text-primary transition-colors py-2"
                    onClick={closeMobileMenu}
                  >
                    <EyeIcon className="w-4 h-4 inline mr-2" />
                    View My Pledge
                  </Link>
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
              {showPublicCTAs && (
                <Link
                  to="/login"
                  className="text-left text-base font-medium hover:text-primary transition-colors py-2"
                  onClick={closeMobileMenu}
                >
                  Log In
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
