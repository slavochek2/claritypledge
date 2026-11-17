/**
 * @file template-routes.tsx
 * @description Public, shareable pages: /partner-template (P508) and /game (P1696). Their own module because
 * App.tsx is over its size limit and may not grow; App.tsx renders `{templateRoutes(LazyRoute)}` inside its <Routes>
 * (the code-routes.tsx pattern). p1223 and p1604 read this file alongside App.tsx.
 */
import { lazy, type ComponentType, type ReactNode } from 'react';
import { Route } from 'react-router-dom';
import { ClarityLandingLayout } from '@/app/layouts/clarity-landing-layout';

const PartnerTemplatePage = lazy(() => import('@/app/pages/partner-template-page').then((m) => ({ default: m.PartnerTemplatePage })));
const ListeningGamePage = lazy(() => import('@/app/pages/listening-game-page').then((m) => ({ default: m.ListeningGamePage })));

type LazyRouteComponent = ComponentType<{ children: ReactNode }>;

export function templateRoutes(LazyRoute: LazyRouteComponent) {
  return (
    <>
      {/* P508: Public Partner Agreement Template — no auth required */}
      <Route
        path="/partner-template"
        element={
          <ClarityLandingLayout surface="public">
            <LazyRoute>
              <PartnerTemplatePage />
            </LazyRoute>
          </ClarityLandingLayout>
        }
      />
      {/* P1696: Public Listening Game page — no auth required, writes no preparation state.
          Lives here rather than in App.tsx, which is over its size limit and may not grow. */}
      <Route
        path="/game"
        element={
          <ClarityLandingLayout surface="public">
            <LazyRoute>
              <ListeningGamePage />
            </LazyRoute>
          </ClarityLandingLayout>
        }
      />
    </>
  );
}
