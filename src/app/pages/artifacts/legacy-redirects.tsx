/**
 * @file legacy-redirects.tsx
 * @description P1545: the old Letters list (/letters, /docs) moved into the Artifacts page. Old links
 * (bookmarks, emails, returnTo values) keep landing in the right list: Drafts, Sent and Received under the Letters
 * tab. /letters/drafts/:docId is a real page and is not touched.
 */
import { Navigate, useLocation } from 'react-router-dom';
import { ARTIFACTS_LETTERS_DRAFTS, legacyLettersTarget } from './legacy-redirect-targets';

export function LettersRedirect() {
  const { search } = useLocation();
  return <Navigate to={legacyLettersTarget(search)} replace />;
}

export function DocsRedirect() {
  return <Navigate to={ARTIFACTS_LETTERS_DRAFTS} replace />;
}
