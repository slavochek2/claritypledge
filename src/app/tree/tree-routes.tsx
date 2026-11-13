/**
 * @file tree-routes.tsx
 * @description The /tree/* routes: experimental pages and the P955 gate fixtures (/tree/_gate/*), DEV-gated by default
 * (.claude/rules/src.md, Prototype Routes). They live here, not in App.tsx, which is over the size limit and may not grow:
 * App.tsx renders `{import.meta.env.DEV && treeRoutes(LazyRoute)}` inside its <Routes>. React Router reads the routes of a
 * Fragment, so a function returning one is a valid child. Each route keeps its own same-line `import.meta.env.DEV &&`, and the groups below stay under the
 * complexity limit.
 */
import { lazy, type ComponentType, type ReactNode } from 'react';
import { Route } from 'react-router-dom';
import { ClarityLandingLayout } from '@/app/layouts/clarity-landing-layout';

const ClarityPledgeLanding = lazy(() => import("@/app/pages/clarity-pledge-landing").then(m => ({ default: m.ClarityPledgeLanding })));
const TreePage = lazy(() => import("@/app/pages/TreePage").then(m => ({ default: m.TreePage })));
const GateFixtureExample = lazy(() => import("@/app/tree/_gate/example/GateFixture").then(m => ({ default: m.GateFixture })));
const DesignPrivatePage = lazy(() => import("@/app/pages/design-private-page").then(m => ({ default: m.DesignPrivatePage })));
const DesignButtonsPage = lazy(() => import("@/app/pages/design-buttons-page").then(m => ({ default: m.DesignButtonsPage })));
const DesignBluePage = lazy(() => import("@/app/pages/design-blue-page").then(m => ({ default: m.DesignBluePage })));
const GateFixtureTermsUpdate = lazy(() => import("@/app/tree/_gate/terms-update/GateFixture").then(m => ({ default: m.GateFixture })));
const DesignAuditPage = lazy(() => import("@/app/pages/design-audit-page").then(m => ({ default: m.DesignAuditPage })));
const LandingV2 = lazy(() => import("@/app/pages/landing-v2").then(m => ({ default: m.LandingV2 })));
const LandingV3 = lazy(() => import("@/app/pages/landing-v3").then(m => ({ default: m.LandingV3 })));
const LandingV4 = lazy(() => import("@/app/pages/landing-v4").then(m => ({ default: m.LandingV4 })));
const LandingWatch = lazy(() => import("@/app/tree/landing-lab/watch/LandingWatch").then(m => ({ default: m.LandingWatch })));
const LandingDo = lazy(() => import("@/app/tree/landing-lab/do/LandingDo").then(m => ({ default: m.LandingDo })));
const LandingWild = lazy(() => import("@/app/tree/landing-lab/wild/LandingWild").then(m => ({ default: m.LandingWild })));
const LandingFable = lazy(() => import("@/app/tree/landing-lab/fable/LandingFable").then(m => ({ default: m.LandingFable })));
const LandingFableChange = lazy(() => import("@/app/tree/landing-lab/fable/LandingFableChange").then(m => ({ default: m.LandingFableChange })));
const LandingFableExamples = lazy(() => import("@/app/tree/landing-lab/fable/LandingFableExamples").then(m => ({ default: m.LandingFableExamples })));
const LandingFirst = lazy(() => import("@/app/tree/landing-lab/first/LandingFirst").then(m => ({ default: m.LandingFirst })));
const PositionButtonsPrototype = lazy(() => import("@/app/pages/position-buttons-prototype").then(m => ({ default: m.PositionButtonsPrototype })));
const P1336OnboardingPrototype = lazy(() => import("@/app/pages/prototypes/p1336-onboarding-prototype").then(m => ({ default: m.P1336OnboardingPrototype })));
const ComparePositionsPrototype = lazy(() => import("@/app/pages/prototypes/p1337-compare-positions-prototype").then(m => ({ default: m.ComparePositionsPrototype })));
const HostControlsPrototype = lazy(() => import("@/app/pages/prototypes/p1337-host-controls-prototype").then(m => ({ default: m.HostControlsPrototype })));
const ProfileCompareEntryPrototype = lazy(() => import("@/app/pages/prototypes/p1337-profile-compare-entry-prototype").then(m => ({ default: m.ProfileCompareEntryPrototype })));
const EventTranscriptionPrototype = lazy(() => import("@/app/prototypes/event-transcription/EventTranscriptionPrototype").then(m => ({ default: m.EventTranscriptionPrototype })));
const LoadingDemoPage = lazy(() => import("@/app/pages/loading-demo-page").then(m => ({ default: m.LoadingDemoPage })));
const UspContrastDemo = lazy(() => import("@/app/pages/usp-contrast-demo").then(m => ({ default: m.UspContrastDemo })));
const NotFoundDrift = lazy(() => import("@/app/pages/not-found-page").then(m => ({ default: m.NotFoundDrift })));
const NotFoundGlitch = lazy(() => import("@/app/pages/not-found-page").then(m => ({ default: m.NotFoundGlitch })));
const NotFoundCompass = lazy(() => import("@/app/pages/not-found-page").then(m => ({ default: m.NotFoundCompass })));
const NewLivePrototype = lazy(() => import("@/app/pages/prototypes/new-live-prototype").then(m => ({ default: m.NewLivePrototype })));
const LinksMenuPrototype = lazy(() => import("@/app/pages/prototypes/links-menu-prototype").then(m => ({ default: m.LinksMenuPrototype })));
const AdminUsersPrototype = lazy(() => import("@/app/pages/prototypes/admin-users-prototype").then(m => ({ default: m.AdminUsersPrototype })));
const GateFixtureCanvasThread = lazy(() => import("@/app/tree/_gate/canvas-thread/GateFixture").then(m => ({ default: m.GateFixture })));
const GateFixtureCanvasWorkspace = lazy(() => import("@/app/tree/_gate/canvas-workspace/GateFixture").then(m => ({ default: m.GateFixture })));
const GateFixtureCanvasDraft = lazy(() => import("@/app/tree/_gate/canvas-draft/GateFixture").then(m => ({ default: m.GateFixture })));

type LazyRouteComponent = ComponentType<{ children: ReactNode }>;

/*
============================================================
PROTOTYPES — experimental routes under /tree, DEV-GATED BY DEFAULT.
Each /tree/* route is wrapped in {import.meta.env.DEV && …}. In prod
import.meta.env.DEV is false, so the route is never registered
(unreachable — navigating there falls through to the 404) and its path
string is stripped from the always-loaded index chunk.
IMPORTANT: gating controls REACHABILITY, not bundling. The lazy component
chunk still deploys to dist/assets as dead, never-fetched code — a
lazy(() => import()) const is not tree-shaken away (see decisions.md:
"DEV guard only prevents rendering"; only EXPLICIT import removal strips a
chunk). Accepted here: these are mock-free, secret-free, unreachable in prod.
Conventions:
• One prefix: /tree/*. Never invent another (/_proto, /_preview retired).
• Lazy-import new demos — keeps them out of the main index chunk, though
the split chunk still ships until the import is explicitly removed.
• The /tree/404-* variants share the live not-found-page chunk: their
PATH strings are stripped; the variant code rides the prod 404 chunk.
• A genuinely prod-reachable route placed here stays ungated on purpose
and must carry  // PROD-REACHABLE: <reason>  on its route line.
Self-contained: they do NOT import main app code (api.ts, auth, etc.)
============================================================
*/

/** The /tree hub, the P955 gate fixtures and the design pages. */
function hubAndFixtureRoutes(LazyRoute: LazyRouteComponent) {
  return (
    <>
      {import.meta.env.DEV && <Route path="/tree" element={<LazyRoute><TreePage /></LazyRoute>} />}
      {import.meta.env.DEV && <Route path="/tree/_gate/example" element={<LazyRoute><GateFixtureExample /></LazyRoute>} />}
      {import.meta.env.DEV && <Route path="/tree/design-private" element={<LazyRoute><DesignPrivatePage /></LazyRoute>} />}
      {import.meta.env.DEV && <Route path="/tree/design-buttons" element={<LazyRoute><DesignButtonsPage /></LazyRoute>} />}
      {import.meta.env.DEV && <Route path="/tree/design-blue" element={<LazyRoute><DesignBluePage /></LazyRoute>} />}
      {import.meta.env.DEV && <Route path="/tree/_gate/terms-update" element={<LazyRoute><GateFixtureTermsUpdate /></LazyRoute>} />}
      {import.meta.env.DEV && <Route path="/tree/_gate/canvas-thread" element={<LazyRoute><GateFixtureCanvasThread /></LazyRoute>} />}
      {import.meta.env.DEV && <Route path="/tree/_gate/canvas-workspace" element={<LazyRoute><GateFixtureCanvasWorkspace /></LazyRoute>} />}
      {import.meta.env.DEV && <Route path="/tree/_gate/canvas-draft" element={<LazyRoute><GateFixtureCanvasDraft /></LazyRoute>} />}
      {import.meta.env.DEV && <Route path="/tree/design-audit" element={<LazyRoute><DesignAuditPage /></LazyRoute>} />}
    </>
  );
}

/** The landing-page explorations and the 404 variants. */
function landingRoutes(LazyRoute: LazyRouteComponent) {
  return (
    <>
      {import.meta.env.DEV && <Route path="/tree/landing-v2" element={<LazyRoute><LandingV2 /></LazyRoute>} />}
      {import.meta.env.DEV && <Route path="/tree/landing-v3" element={<LazyRoute><LandingV3 /></LazyRoute>} />}
      {import.meta.env.DEV && <Route path="/tree/landing-v4" element={<LazyRoute><LandingV4 /></LazyRoute>} />}
      {import.meta.env.DEV && <Route path="/tree/landing-watch" element={<LazyRoute><LandingWatch /></LazyRoute>} />}
      {import.meta.env.DEV && <Route path="/tree/landing-do" element={<LazyRoute><LandingDo /></LazyRoute>} />}
      {import.meta.env.DEV && <Route path="/tree/landing-fable" element={<ClarityLandingLayout surface="public"><LazyRoute><LandingFable /></LazyRoute></ClarityLandingLayout>} />}
      {import.meta.env.DEV && <Route path="/tree/landing-fable-change" element={<ClarityLandingLayout surface="public"><LazyRoute><LandingFableChange /></LazyRoute></ClarityLandingLayout>} />}
      {import.meta.env.DEV && <Route path="/tree/landing-fable-examples" element={<ClarityLandingLayout surface="public"><LazyRoute><LandingFableExamples /></LazyRoute></ClarityLandingLayout>} />}
      {import.meta.env.DEV && <Route path="/tree/landing-wild" element={<LazyRoute><LandingWild /></LazyRoute>} />}
      {import.meta.env.DEV && <Route path="/tree/landing-first" element={<LazyRoute><LandingFirst /></LazyRoute>} />}
      {import.meta.env.DEV && <Route path="/tree/old-landing" element={<ClarityLandingLayout surface="public"><LazyRoute><ClarityPledgeLanding /></LazyRoute></ClarityLandingLayout>} />}
      {import.meta.env.DEV && <Route path="/tree/404-drift" element={<ClarityLandingLayout surface="public"><LazyRoute><NotFoundDrift /></LazyRoute></ClarityLandingLayout>} />}
      {import.meta.env.DEV && <Route path="/tree/404-glitch" element={<ClarityLandingLayout surface="public"><LazyRoute><NotFoundGlitch /></LazyRoute></ClarityLandingLayout>} />}
      {import.meta.env.DEV && <Route path="/tree/404-compass" element={<ClarityLandingLayout surface="public"><LazyRoute><NotFoundCompass /></LazyRoute></ClarityLandingLayout>} />}
    </>
  );
}

/** The throwaway design explorations and prototypes. */
function prototypeRoutes(LazyRoute: LazyRouteComponent) {
  return (
    <>
      {import.meta.env.DEV && <Route path="/tree/position-buttons" element={<LazyRoute><PositionButtonsPrototype /></LazyRoute>} />}
      {import.meta.env.DEV && <Route path="/tree/compare-positions" element={<LazyRoute><ComparePositionsPrototype /></LazyRoute>} />}
      {import.meta.env.DEV && <Route path="/tree/host-controls" element={<LazyRoute><HostControlsPrototype /></LazyRoute>} />}
      {import.meta.env.DEV && <Route path="/tree/compare-entry" element={<LazyRoute><ProfileCompareEntryPrototype /></LazyRoute>} />}
      {import.meta.env.DEV && <Route path="/tree/p1336" element={<LazyRoute><P1336OnboardingPrototype /></LazyRoute>} />}
      {import.meta.env.DEV && <Route path="/tree/p1336-c" element={<LazyRoute><P1336OnboardingPrototype variant="c" /></LazyRoute>} />}
      {import.meta.env.DEV && <Route path="/tree/p1336-d" element={<LazyRoute><P1336OnboardingPrototype variant="d" /></LazyRoute>} />}
      {import.meta.env.DEV && <Route path="/tree/loading-demo" element={<LazyRoute><LoadingDemoPage /></LazyRoute>} />}
      {import.meta.env.DEV && <Route path="/tree/usp-contrast" element={<LazyRoute><UspContrastDemo /></LazyRoute>} />}
      {import.meta.env.DEV && <Route path="/tree/new-live" element={<LazyRoute><NewLivePrototype /></LazyRoute>} />}
      {import.meta.env.DEV && <Route path="/tree/links-menu" element={<LazyRoute><LinksMenuPrototype /></LazyRoute>} />}
      {import.meta.env.DEV && <Route path="/tree/admin-users" element={<LazyRoute><AdminUsersPrototype /></LazyRoute>} />}
      {import.meta.env.DEV && <Route path="/tree/event-transcription" element={<LazyRoute><EventTranscriptionPrototype /></LazyRoute>} />}
    </>
  );
}

/** `LazyRoute`: App.tsx's chunk-error + Suspense wrapper, passed in so this file imports nothing from App.tsx. */
export function treeRoutes(LazyRoute: LazyRouteComponent) {
  return (
    <>
      {hubAndFixtureRoutes(LazyRoute)}
      {landingRoutes(LazyRoute)}
      {prototypeRoutes(LazyRoute)}
    </>
  );
}
