/**
 * @file legacy-redirects.tsx
 * @description P1545: the old Letters list (/letters, /docs) moved into the Artifacts page. Old links
 * (bookmarks, emails, returnTo values) keep landing in the right tab. Drafts and sent letters are both
 * "Yours"; the letter inbox is "Shared with you". /letters/drafts/:docId is a real page and is not touched.
 */
import { Navigate, useLocation } from 'react-router-dom';
import { ARTIFACTS_YOURS_LETTERS, legacyLettersTarget } from './legacy-redirect-targets';

export function LettersRedirect() {
  const { search } = useLocation();
  return <Navigate to={legacyLettersTarget(search)} replace />;
}

export function DocsRedirect() {
  return <Navigate to={ARTIFACTS_YOURS_LETTERS} replace />;
}
