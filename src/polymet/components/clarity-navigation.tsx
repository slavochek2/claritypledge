import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MenuIcon, XIcon, LogOutIcon, LayoutDashboardIcon, EyeIcon, SettingsIcon, FileTextIcon, UsersIcon, BriefcaseIcon } from "lucide-react";
import { useUser } from "@/hooks/use-user";

interface ClarityNavigationProps {
  onTakePledge: () => void;
  onSignIn?: () => void;
}

export function ClarityNavigation({
  onTakePledge,
  onSignIn,
}: ClarityNavigationProps) {
  const navigate = useNavigate();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { user: currentUser, isLoading: isLoadingUser, signOut } = useUser();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
      setIsMobileMenuOpen(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    setIsMobileMenuOpen(false);
    // Redirect to home page after sign out
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
        <div className="flex items-center justify-between h-16 lg:h-20">
          {/* Logo */}
          <Link
            to="/"
            className="text-xl lg:text-2xl font-bold tracking-tight hover:opacity-80 transition-opacity"
          >
            Clarity Pledge
          </Link>

          {/* Desktop Navigation - Only show public links when logged out */}
          {!isLoadingUser && !currentUser && (
            <div className="hidden md:flex items-center gap-8">
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
                Our Services
              </Link>
            </div>
          )}

          {/* CTA Buttons */}
          <div className="hidden md:flex items-center gap-4">
            {!isLoadingUser && (
              <>
                {currentUser ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="lg"
                        className="gap-2"
                      >
                        <MenuIcon className="w-5 h-5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuItem asChild>
                        <Link
                          to="/dashboard"
                          className="cursor-pointer"
                        >
                          <LayoutDashboardIcon className="w-4 h-4 mr-2" />
                          Dashboard
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link
                          to={`/p/${currentUser.slug || currentUser.id}`}
                          className="cursor-pointer"
                          onClick={() => {
                            const urlPath = `/p/${currentUser.slug || currentUser.id}`;
                            console.log('🔗 Navigating to profile:', {
                              slug: currentUser.slug,
                              id: currentUser.id,
                              generatedPath: urlPath
                            });
                          }}
                        >
                          <EyeIcon className="w-4 h-4 mr-2" />
                          View My Pledge
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <Link
                          to="/settings"
                          className="cursor-pointer"
                        >
                          <SettingsIcon className="w-4 h-4 mr-2" />
                          Settings
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={handleSignOut}
                        className="cursor-pointer"
                      >
                        <LogOutIcon className="w-4 h-4 mr-2" />
                        Log Out
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <>
                    {onSignIn && (
                      <Button
                        onClick={onSignIn}
                        variant="ghost"
                        className="text-base font-medium hover:text-primary transition-colors"
                      >
                        Log In
                      </Button>
                    )}
                    <Button
                      onClick={onTakePledge}
                      size="lg"
                      className="bg-blue-500 hover:bg-blue-600 text-white font-semibold"
                    >
                      Take the Pledge
                    </Button>
                  </>
                )}
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
        {isMobileMenuOpen && !isLoadingUser && (
          <div className="md:hidden py-4 border-t border-border bg-background">
            <div className="flex flex-col gap-4">
              {currentUser ? (
                <>
                  {/* User Links */}
                  <Link
                    to="/dashboard"
                    className="text-left text-base font-medium hover:text-primary transition-colors py-2"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <LayoutDashboardIcon className="w-4 h-4 inline mr-2" />
                    Dashboard
                  </Link>
                  <Link
                    to={`/p/${currentUser.slug || currentUser.id}`}
                    className="text-left text-base font-medium hover:text-primary transition-colors py-2"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <EyeIcon className="w-4 h-4 inline mr-2" />
                    View My Pledge
                  </Link>
                  <div className="border-t border-border my-2"></div>
                  {/* Settings & Logout */}
                  <Link
                    to="/settings"
                    className="text-left text-base font-medium hover:text-primary transition-colors py-2"
                    onClick={() => setIsMobileMenuOpen(false)}
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
              ) : (
                <>
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
                    Our Services
                  </Link>
                  {onSignIn && (
                    <button
                      onClick={onSignIn}
                      className="text-left text-base font-medium hover:text-primary transition-colors py-2"
                    >
                      Log In
                    </button>
                  )}
                  <Button
                    onClick={onTakePledge}
                    size="lg"
                    className="bg-blue-500 hover:bg-blue-600 text-white font-semibold w-full"
                  >
                    Take the Pledge
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
