/**
 * @file legacy-redirects.tsx
 * @description Small redirect elements for old URLs, used by the route table in src/App.tsx.
 */
import { Navigate, useSearchParams, useParams } from "react-router-dom";

/** P486: Redirect /chat → /create, forwarding all query params via useSearchParams */
export function ChatRedirect() {
  const [searchParams] = useSearchParams();
  const qs = searchParams.toString();
  return <Navigate to={qs ? `/create?${qs}` : '/create'} replace />;
}

/** P660: Redirect /d/:docId → /letters/drafts/:docId */
export function DocDetailRedirect() {
  const { docId } = useParams();
  return <Navigate to={`/letters/drafts/${docId}`} replace />;
}

export function FeedTagRedirect() {
  const { tag } = useParams();
  return <Navigate to={`/feed?tag=${encodeURIComponent(tag || '')}&sort=oldest&version=latest`} replace />;
}
