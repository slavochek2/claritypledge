import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { MenuIcon, XIcon, LogOutIcon } from "lucide-react";
import { getCurrentUser, signOut } from "@/polymet/data/mock-profiles";

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
  const [currentUser, setCurrentUser] = useState(getCurrentUser());

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

  const handleSignOut = () => {
    signOut();
    setCurrentUser(null);
    setIsMobileMenuOpen(false);
    // Redirect to home page after sign out
    navigate("/");
  };

  useEffect(() => {
    setCurrentUser(getCurrentUser());
  }, []);

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

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            <Link
              to="/"
              className="text-base font-medium hover:text-primary transition-colors"
            >
              The Pledge
            </Link>
            <Link
              to="/signatories"
              className="text-base font-medium hover:text-primary transition-colors"
            >
              Who Signed
            </Link>
          </div>

          {/* CTA Buttons */}
          <div className="hidden md:flex items-center gap-4">
            {currentUser ? (
              <>
                <Link
                  to={`/p/${currentUser.id}`}
                  className="text-base font-medium hover:text-primary transition-colors"
                >
                  My Profile
                </Link>
                <Button
                  onClick={handleSignOut}
                  variant="outline"
                  size="lg"
                  className="gap-2"
                >
                  <LogOutIcon className="w-4 h-4" />
                  Log Out
                </Button>
              </>
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
              <Link
                to="/"
                className="text-left text-base font-medium hover:text-primary transition-colors py-2"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                The Pledge
              </Link>
              <Link
                to="/signatories"
                className="text-left text-base font-medium hover:text-primary transition-colors py-2"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Who Signed
              </Link>
              {currentUser ? (
                <>
                  <Link
                    to={`/p/${currentUser.id}`}
                    className="text-left text-base font-medium hover:text-primary transition-colors py-2"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    My Profile
                  </Link>
                  <Button
                    onClick={handleSignOut}
                    variant="outline"
                    size="lg"
                    className="gap-2 w-full"
                  >
                    <LogOutIcon className="w-4 h-4" />
                    Log Out
                  </Button>
                </>
              ) : (
                <>
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
