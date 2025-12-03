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

  const { session, user: currentUser, isLoading, signOut } = useAuth();

  // Show user menu when logged in (session exists)
  const isLoggedIn = !!session;

  // Show public CTAs only when auth state is resolved and user is not logged in
  const showPublicCTAs = !isLoading && !isLoggedIn;

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
    } catch (error) {
      console.error("Sign out failed:", error);
    } finally {
      setIsMobileMenuOpen(false);
      navigate("/");
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

          {/* Desktop Navigation - Public Links (visible to all users) */}
          {/* Centered on lg+; on md uses flex-1 to avoid overlap with logo/CTAs */}
          <div className="hidden md:flex items-center justify-center gap-6 lg:gap-8 flex-1 lg:flex-none lg:absolute lg:left-1/2 lg:-translate-x-1/2">
            {NAV_LINKS.map((link) => (
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
            {isLoggedIn && (
              // User Menu - show when logged in
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <button
                    className="flex items-center justify-center hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-full"
                    aria-label="User menu"
                  >
                    <GravatarAvatar
                      email={currentUser?.email}
                      name={currentUser?.name || ""}
                      size="sm"
                      avatarColor={currentUser?.avatarColor}
                    />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={8} className="w-56">
                  <DropdownMenuItem asChild>
                    {/* Use profile slug if loaded, otherwise session user id */}
                    <Link
                      to={`/p/${currentUser?.slug || session?.user?.id}`}
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
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {showPublicCTAs && (
              // Public Actions - show only when auth state known AND not logged in
              <>
                <Link
                  to="/login"
                  className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-base font-medium hover:text-primary transition-colors h-9 px-4 py-2"
                >
                  Log In
                </Link>
                <Link
                  to="/sign-pledge"
                  className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 shadow h-10 rounded-md px-8 bg-blue-500 hover:bg-blue-600 text-white font-semibold"
                >
                  Take the Pledge
                </Link>
              </>
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
              {/* Navigation Links - always visible */}
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

              {/* Logged in user links */}
              {isLoggedIn && (
                <>
                  <div className="border-t border-border my-2"></div>
                  <Link
                    to={`/p/${currentUser?.slug || session?.user?.id}`}
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

              {/* Public CTAs - only when auth state known and not logged in */}
              {showPublicCTAs && (
                <>
                  <Link
                    to="/login"
                    className="text-left text-base font-medium hover:text-primary transition-colors py-2"
                    onClick={closeMobileMenu}
                  >
                    Log In
                  </Link>
                  <Link
                    to="/sign-pledge"
                    className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 shadow h-10 rounded-md px-8 bg-blue-500 hover:bg-blue-600 text-white font-semibold w-full"
                    onClick={closeMobileMenu}
                  >
                    Take the Pledge
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
