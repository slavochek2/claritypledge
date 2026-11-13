import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

/**
 * Keeps pledge-invite links working on the landings that receive them (/hiring, /coach, /founder):
 * a truthy `?referrer=` goes to /sign-pledge; otherwise a truthy `?login=` goes to /login.
 * Call it after the page's view effect, so the view is tracked first, as before.
 */
export function useInviteRedirects() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  useEffect(() => {
    if (searchParams.get("referrer")) {
      navigate("/sign-pledge");
    } else if (searchParams.get("login")) {
      navigate("/login");
    }
  }, [searchParams, navigate]);
}
