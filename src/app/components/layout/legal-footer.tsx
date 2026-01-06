/**
 * @file legal-footer.tsx
 * @description Footer component displaying copyright and links to legal pages.
 * Legal entity disclosure (TechSalesBox OÜ) is in Privacy Policy and Terms of Service.
 */
import { Link } from "react-router-dom";

export function LegalFooter() {
  return (
    <footer className="border-t border-border py-8 mt-16">
      <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
        <p>
          © 2026 The Clarity Pledge
        </p>
        <p className="mt-2">
          <Link to="/privacy-policy" className="hover:text-blue-600">Privacy Policy</Link>
          {" · "}
          <Link to="/terms-of-service" className="hover:text-blue-600">Terms of Service</Link>
        </p>
      </div>
    </footer>
  );
}
