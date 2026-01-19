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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MenuIcon, XIcon } from "lucide-react";
import { ClarityLogo } from "@/components/ui/clarity-logo";
import { GravatarAvatar } from "@/components/ui/gravatar-avatar";
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
  // Note: showPublicCTAs, slug, hasPledged handled by NavigationMenuItems (shared component)
  // P67: user is needed for avatar display
  const {
    showUserMenu,
    user,
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

          {/* Desktop: Nav links + CTA + Menu */}
          <div className="hidden lg:flex items-center gap-3">
            {/* Visible nav links - order: Events, Pledgers, Manifesto, About, Collaborate (non-logged-in) */}
            <Link
              to="/events"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Events
            </Link>
            <Link
              to="/pledgers"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Pledgers
            </Link>
            <Link
              to="/article"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Manifesto
            </Link>
            <Link
              to="/about"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              About
            </Link>
            {/* P62: Collaborate link for non-logged-in users */}
            {!showUserMenu && (
              <Link
                to="/collaborate"
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Collaborate
              </Link>
            )}
            {/* Start a Clarity Meeting CTA */}
            {/* Analytics: Keep 'try_meeting' event name for historical continuity (P66 decision) */}
            <Link
              to="/live"
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring shadow h-10 rounded-md px-8 bg-blue-500 hover:bg-blue-600 text-white font-semibold"
              onClick={() => analytics.track('nav_cta_clicked', { cta: 'try_meeting', device: 'desktop' })}
            >
              Start a Clarity Meeting
            </Link>
            {/* Menu Trigger - P67: Avatar for verified users, hamburger for everyone else */}
            <DropdownMenu modal={false} onOpenChange={(open) => {
              if (open) {
                analytics.track('nav_menu_opened', {
                  trigger: showUserMenu && user ? 'avatar' : 'hamburger',
                  device: 'desktop',
                });
              }
            }}>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center justify-center hover:bg-accent transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-md p-2"
                  aria-label="Menu"
                >
                  {showUserMenu && user ? (
                    <GravatarAvatar
                      name={user.name}
                      avatarColor={user.avatarColor}
                      photoUrl={user.avatarUrl}
                      size="sm"
                    />
                  ) : (
                    <MenuIcon className="w-5 h-5" />
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={8} className="w-48">
                {/* Auth Menu Items - KISS: Uses shared component */}
                {/* Nav links are now visible in the nav bar, not in dropdown */}
                <NavigationMenuItems onSignOut={handleSignOut} />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Mobile Menu Button - P67: Avatar for verified users when closed, X when open */}
          <button
            onClick={() => {
              const wasOpen = isMobileMenuOpen;
              setIsMobileMenuOpen(!isMobileMenuOpen);
              // Track opening (not closing)
              if (!wasOpen) {
                analytics.track('nav_menu_opened', {
                  trigger: showUserMenu && user ? 'avatar' : 'hamburger',
                  device: 'mobile',
                });
              }
            }}
            className="lg:hidden p-2"
            aria-expanded={isMobileMenuOpen}
            aria-controls={MOBILE_MENU_ID}
            aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
          >
            {isMobileMenuOpen ? (
              <XIcon className="w-6 h-6" />
            ) : showUserMenu && user ? (
              <GravatarAvatar
                name={user.name}
                avatarColor={user.avatarColor}
                photoUrl={user.avatarUrl}
                size="sm"
              />
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
              {/* Primary CTA */}
              {/* Analytics: Keep 'try_meeting' event name for historical continuity (P66 decision) */}
              <Link
                to="/live"
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring shadow h-11 rounded-md px-8 bg-blue-500 hover:bg-blue-600 text-white font-semibold w-full"
                onClick={() => {
                  analytics.track('nav_cta_clicked', { cta: 'try_meeting', device: 'mobile' });
                  closeMobileMenu();
                }}
              >
                Start a Clarity Meeting
              </Link>

              <div className="border-t border-border my-2"></div>

              {/* Navigation Links - P62: Filter out Collaborate for logged-in users */}
              {NAV_LINKS.filter(link => !(showUserMenu && link.to === '/collaborate')).map((link) => (
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

              {/* KISS: Two states only - using shared NavigationMenuItems */}
              <NavigationMenuItems
                variant="mobile"
                onSignOut={handleSignOut}
                onItemClick={closeMobileMenu}
              />
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
