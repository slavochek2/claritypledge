import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MenuIcon, XIcon, LogOutIcon, EyeIcon, UserIcon } from "lucide-react";

// Get initials from name (e.g., "John Doe" -> "JD")
function getInitials(name?: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function SimpleNavigation() {
  const navigate = useNavigate();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // session: instant auth check (from localStorage, no DB call)
  // user: profile data (requires DB fetch)
  // isLoading: true until initial session check completes
  const { session, user: currentUser, isLoading, signOut } = useAuth();

  // User is considered logged in if session exists (instant check)
  // Don't show public CTAs while auth state is loading to avoid flicker
  const isLoggedIn = !!session;
  const showPublicCTAs = !isLoading && !isLoggedIn;

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleSignOut = async () => {
    await signOut();
    setIsMobileMenuOpen(false);
    navigate("/");
  };

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
            className="text-xl lg:text-2xl font-bold tracking-tight hover:opacity-80 transition-opacity"
          >
            Clarity Pledge
          </Link>

          {/* Desktop Navigation - Public Links (visible to all users) */}
          {/* Absolutely centered so links don't shift when right-side content changes */}
          <div className="hidden md:flex items-center gap-8 absolute left-1/2 -translate-x-1/2">
            <Link
              to="/article"
              className="text-base font-medium hover:text-primary transition-colors"
            >
              Manifesto
            </Link>
            <Link
              to="/clarity-champions"
              className="text-base font-medium hover:text-primary transition-colors"
            >
              Clarity Champions
            </Link>
            <Link
              to="/our-services"
              className="text-base font-medium hover:text-primary transition-colors"
            >
              Services
            </Link>
          </div>

          {/* CTA Buttons / User Menu */}
          <div className="hidden md:flex items-center gap-4">
            {isLoggedIn && (
              // User Menu - show when logged in
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <button
                    className="flex items-center justify-center w-10 h-10 rounded-full text-white font-semibold text-sm hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    style={{
                      backgroundColor: currentUser?.avatarColor || "#3b82f6",
                    }}
                    aria-label="User menu"
                  >
                    {currentUser ? getInitials(currentUser.name) : <UserIcon className="w-5 h-5" />}
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
          <div className="md:hidden py-4 border-t border-border bg-background">
            <div className="flex flex-col gap-4">
              {/* Navigation Links - always visible */}
              <Link
                to="/article"
                className="text-left text-base font-medium hover:text-primary transition-colors py-2"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Manifesto
              </Link>
              <Link
                to="/clarity-champions"
                className="text-left text-base font-medium hover:text-primary transition-colors py-2"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Clarity Champions
              </Link>
              <Link
                to="/our-services"
                className="text-left text-base font-medium hover:text-primary transition-colors py-2"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Services
              </Link>

              {/* Logged in user links */}
              {isLoggedIn && (
                <>
                  <div className="border-t border-border my-2"></div>
                  <Link
                    to={`/p/${currentUser?.slug || session?.user?.id}`}
                    className="text-left text-base font-medium hover:text-primary transition-colors py-2"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <EyeIcon className="w-4 h-4 inline mr-2" />
                    View My Pledge
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
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    Log In
                  </Link>
                  <Link
                    to="/sign-pledge"
                    className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 shadow h-10 rounded-md px-8 bg-blue-500 hover:bg-blue-600 text-white font-semibold w-full"
                    onClick={() => setIsMobileMenuOpen(false)}
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

