/**
 * @file code-routes.tsx
 * @description P1556: /connect/:token, a personal contact code. Its own module because App.tsx is over its size limit
 * and may not grow; App.tsx renders `{codeRoutes(LazyRoute)}` inside its <Routes> (the tree-routes.tsx pattern). The
 * pattern also lives in index.html's and url-token-redaction.ts's redaction, and in the redirect allowlist.
 */
import { lazy, type ComponentType, type ReactNode } from 'react';
import { Route } from 'react-router-dom';
import { ClarityLandingLayout } from '@/app/layouts/clarity-landing-layout';

const ConnectPage = lazy(() => import('@/app/pages/connect-page').then((m) => ({ default: m.ConnectPage })));

type LazyRouteComponent = ComponentType<{ children: ReactNode }>;

export function codeRoutes(LazyRoute: LazyRouteComponent) {
  return (
    <>
      {/* A literal path, not CONTACT_CODE_PATH: p1223-redirect-allowlist.test.ts reads route paths from source. */}
      <Route
        path="/connect/:token"
        element={
          <ClarityLandingLayout surface="product">
            <LazyRoute>
              <ConnectPage />
            </LazyRoute>
          </ClarityLandingLayout>
        }
      />
    </>
  );
}
