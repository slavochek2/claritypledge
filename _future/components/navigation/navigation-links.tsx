import { Link } from "react-router-dom";

export function NavigationLinks() {
  return (
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
  );
}

