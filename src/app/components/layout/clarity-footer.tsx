import { Link } from "react-router-dom";
import { GithubIcon } from "lucide-react";
import { NAV_LINKS } from "./nav-links";

export function ClarityFooter() {
  return (
    <footer className="border-t border-border bg-muted/30 py-12 px-4">
      <div className="container mx-auto max-w-6xl">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          {/* Navigation */}
          <div>
            <h3 className="text-lg font-bold mb-3">Explore</h3>
            <div className="space-y-2">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className="block text-base text-muted-foreground hover:text-foreground transition-colors"
                >
                  {link.label}
                </Link>
              ))}
              <a
                href="https://blog.claritypledge.com"
                className="block text-base text-muted-foreground hover:text-foreground transition-colors"
              >
                Blog
              </a>
            </div>
          </div>

          {/* Legal */}
          <div>
            <h3 className="text-lg font-bold mb-3">Legal</h3>
            <div className="space-y-2">
              <Link
                to="/privacy-policy"
                className="block text-base text-muted-foreground hover:text-foreground transition-colors"
              >
                Privacy Policy
              </Link>
              <Link
                to="/terms-of-service"
                className="block text-base text-muted-foreground hover:text-foreground transition-colors"
              >
                Terms of Service
              </Link>
            </div>
          </div>
        </div>

        {/* Copyright + GitHub */}
        <div className="flex flex-col items-center gap-4 pt-8 border-t border-border">
          <a
            href="https://github.com/slavochek2/claritypledge"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <GithubIcon className="w-4 h-4" />
            Open Source (AGPL-3.0)
          </a>
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} The Clarity Pledge
          </p>
        </div>
      </div>
    </footer>
  );
}
