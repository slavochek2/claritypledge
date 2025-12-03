import { Link } from "react-router-dom";

export function ClarityFooter() {
  return (
    <footer className="border-t border-border bg-muted/30 py-12 px-4">
      <div className="container mx-auto max-w-6xl">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          {/* The Theory */}
          <div>
            <h3 className="text-lg font-bold mb-3">The Theory</h3>
            <Link
              to="/article"
              className="text-base text-muted-foreground hover:text-foreground transition-colors"
            >
              Read Manifesto
            </Link>
          </div>

          {/* The Movement */}
          <div>
            <h3 className="text-lg font-bold mb-3">The Movement</h3>
            <Link
              to="/our-services"
              className="text-base text-muted-foreground hover:text-foreground transition-colors"
            >
              About Us
            </Link>
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

        {/* Copyright */}
        <div className="text-center pt-8 border-t border-border">
          <p className="text-sm text-muted-foreground">
            © 2025 The Clarity Project.
          </p>
        </div>
      </div>
    </footer>
  );
}
