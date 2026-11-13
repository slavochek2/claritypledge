import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

/**
 * Keeps pledge-invite links working on the landings that receive them (/hiring, /coach, /founder,
 * /builders): a truthy `?referrer=` goes to /sign-pledge; otherwise a truthy `?login=` goes to /login.
 * Call it after the page's view effect, so the view is tracked first, as before.
 *
 * The redirect REPLACES the invite entry (P1680). A push would leave the invite URL one entry back,
 * so the browser's Back would land on it and the redirect would fire again, trapping the visitor.
 */
export function useInviteRedirects() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  useEffect(() => {
    if (searchParams.get("referrer")) {
      navigate("/sign-pledge", { replace: true });
    } else if (searchParams.get("login")) {
      navigate("/login", { replace: true });
    }
  }, [searchParams, navigate]);
}
