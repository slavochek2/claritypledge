/**
 * @file alternative-navigation.tsx
 * @description Alternative navigation with "Start a Meeting" as primary CTA.
 * Nav links change from "Manifesto" to "The Pledge" to position pledge as
 * the aspirational destination rather than entry point.
 */
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
import { MenuIcon, XIcon, LogOutIcon, EyeIcon, SettingsIcon, AwardIcon } from "lucide-react";
import { GravatarAvatar } from "@/components/ui/gravatar-avatar";
import { ClarityLogo } from "@/components/ui/clarity-logo";

const MOBILE_MENU_ID = "mobile-navigation-menu";

// Alternative nav links
const ALT_NAV_LINKS = [
  { to: "/article", label: "Manifesto" },
  { to: "/clarity-champions", label: "Champions" },
  { to: "/about", label: "About" },
] as const;

export function AlternativeNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const { session, user: currentUser, isLoading, sessionChecked, signOut } = useAuth();

  // Show user menu only when BOTH session AND profile are loaded
  const showUserMenu = sessionChecked && !isLoading && !!session && !!currentUser;

  // Show public CTAs only when session check done AND no session found
  const showPublicCTAs = sessionChecked && !session;

  // Check if user has taken the pledge (verified their email via magic link)
  // Users who logged in but haven't completed verification don't have isVerified=true
  const hasTakenPledge = currentUser?.isVerified ?? false;

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
      navigate("/alternative");
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
            to="/alternative"
            className="hover:opacity-80 transition-opacity"
            onClick={(e) => {
              if (location.pathname === "/alternative") {
                e.preventDefault();
                window.scrollTo({ top: 0, behavior: "smooth" });
              }
            }}
          >
            <ClarityLogo size="sm" />
          </Link>

          {/* Desktop Navigation - Public Links */}
          <div className="hidden md:flex items-center justify-center gap-6 lg:gap-8 flex-1 lg:flex-none lg:absolute lg:left-1/2 lg:-translate-x-1/2">
            {ALT_NAV_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="text-base font-medium hover:text-primary transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* CTA Buttons / User Menu */}
          <div className="hidden md:flex items-center gap-4">
            {showPublicCTAs && (
              <Link
                to="/login"
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-base font-medium hover:text-primary transition-colors h-9 px-4 py-2"
              >
                Log In
              </Link>
            )}

            {/* Primary CTA - Start a Meeting (always visible) */}
            <Link
              to="/live"
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 shadow h-10 rounded-md px-6 bg-blue-500 hover:bg-blue-600 text-white font-semibold"
            >
              Start a Meeting
            </Link>

            {showUserMenu && (
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <button
                    className="flex items-center justify-center hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-full"
                    aria-label="User menu"
                  >
                    <GravatarAvatar
                      email={currentUser.email}
                      name={currentUser.name}
                      size="sm"
                      avatarColor={currentUser.avatarColor}
                    />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={8} className="w-56">
                  <DropdownMenuItem asChild>
                    <Link
                      to={`/p/${currentUser.slug}`}
                      className="cursor-pointer"
                    >
                      <EyeIcon className="w-4 h-4 mr-2" />
                      View My Pledge
                    </Link>
                  </DropdownMenuItem>
                  {!hasTakenPledge && (
                    <DropdownMenuItem asChild>
                      <Link to="/sign-pledge" className="cursor-pointer">
                        <AwardIcon className="w-4 h-4 mr-2" />
                        Take the Pledge
                      </Link>
                    </DropdownMenuItem>
                  )}
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
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-2"
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
            className="md:hidden py-4 border-t border-border bg-background"
          >
            <div className="flex flex-col gap-4">
              {/* Primary CTA at top of mobile menu */}
              <Link
                to="/live"
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring shadow h-10 rounded-md px-8 bg-blue-500 hover:bg-blue-600 text-white font-semibold w-full"
                onClick={closeMobileMenu}
              >
                Start a Meeting
              </Link>

              <div className="border-t border-border my-2"></div>

              {/* Navigation Links */}
              {ALT_NAV_LINKS.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className="text-left text-base font-medium hover:text-primary transition-colors py-2"
                  onClick={closeMobileMenu}
                >
                  {link.label}
                </Link>
              ))}

              {/* Logged in user links */}
              {showUserMenu && (
                <>
                  <div className="border-t border-border my-2"></div>
                  <Link
                    to={`/p/${currentUser.slug}`}
                    className="text-left text-base font-medium hover:text-primary transition-colors py-2"
                    onClick={closeMobileMenu}
                  >
                    <EyeIcon className="w-4 h-4 inline mr-2" />
                    View My Pledge
                  </Link>
                  {!hasTakenPledge && (
                    <Link
                      to="/sign-pledge"
                      className="text-left text-base font-medium hover:text-primary transition-colors py-2"
                      onClick={closeMobileMenu}
                    >
                      <AwardIcon className="w-4 h-4 inline mr-2" />
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
                  <div className="border-t border-border my-2"></div>
                  <button
                    onClick={handleSignOut}
                    className="text-left text-base font-medium hover:text-primary transition-colors py-2"
                  >
                    <LogOutIcon className="w-4 h-4 inline mr-2" />
                    Log Out
                  </button>
                </>
              )}

              {/* Public CTAs */}
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
