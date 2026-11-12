/**
 * @file template-routes.tsx
 * @description Public, shareable template page /partner-template (P508). Their own module because
 * App.tsx is over its size limit and may not grow; App.tsx renders `{templateRoutes(LazyRoute)}` inside its <Routes>
 * (the code-routes.tsx pattern). p1223 and p1604 read this file alongside App.tsx.
 */
import { lazy, type ComponentType, type ReactNode } from 'react';
import { Route } from 'react-router-dom';
import { ClarityLandingLayout } from '@/app/layouts/clarity-landing-layout';

const PartnerTemplatePage = lazy(() => import('@/app/pages/partner-template-page').then((m) => ({ default: m.PartnerTemplatePage })));

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
    </>
  );
}
