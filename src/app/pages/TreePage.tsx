import { Link } from 'react-router-dom';

const productionPages = [
  {
    path: '/demo',
    label: 'Demo',
    description: 'Original demo page'
  },
];

const devPages = [
  {
    path: '/tree/landing-fable-examples',
    label: 'Landing redesign: hero drawing examples',
    description: 'The wordless hero drawing for four stories, each with its meaning printed beside it.'
  },
  {
    path: '/tree/landing-fable-change',
    label: 'Landing redesign: change managers',
    description: 'The /change-managers page in the redesigned look, with the labelled hero example.'
  },
  {
    path: '/tree/landing-fable',
    label: 'Landing redesign: builders',
    description: 'The /builders page in the redesigned look, with the labelled hero example.'
  },
  {
    path: '/tree/landing-watch',
    label: 'Landing lab: Watch',
    description: 'Cinematic, video first. The st1 story and the five barriers as moving type.'
  },
  {
    path: '/tree/landing-do',
    label: 'Landing lab: Do',
    description: 'Experiential. Tap a song, guess how many would name it, see the gap.'
  },
  {
    path: '/tree/landing-wild',
    label: 'Landing lab: Wild',
    description: 'A 3D scene of two minds and the gap between them. Reveal the hidden number.'
  },
  {
    path: '/tree/landing-first',
    label: 'Landing lab: Go first',
    description: 'Story, three meanings, a demonstration, the missing norm, then a fork into four next actions.'
  },
  {
    path: '/tree/design-buttons',
    label: 'Design decisions: button rules',
    description: 'Seven button rules, each shown right vs wrong, for approval'
  },
  {
    path: '/tree/design-private',
    label: 'Design decisions: private + certificates',
    description: 'A/B for the private signal (amber is banned) and the certificate paper palette'
  },
  {
    path: '/tree/old-landing',
    label: 'Old Landing (pre-coach)',
    description: 'The previous "/" landing page, replaced by the coach-facing partnership page'
  },
  {
    path: '/tree/new-live',
    label: 'P562: New /live — Dual Sliders',
    description: 'Free mode with continuous sliders. Entry → role claim → sliders → complete. No 3-click protocol.'
  },
  {
    path: '/tree/position-buttons',
    label: 'Position Buttons v2',
    description: 'Two-step progressive disclosure — no hidden dropdowns, clean responsive scaling'
  },
  {
    path: '/tree/design-audit',
    label: 'Design Audit: Certificates',
    description: 'Pledge vs Agreement — side-by-side comparison of all states, buttons, inputs'
  },
  {
    path: '/tree/landing-v2',
    label: 'Landing V2: "The Confession"',
    description: 'Dark, narrative-driven landing — co-founder pairs, vulnerability-led, typography-first'
  },
  {
    path: '/tree/landing-v3',
    label: 'Landing V3: "Clarity Canvas"',
    description: 'Constellation bg, Stories & Points map, explain-back test, calibration score — product-led'
  },
  {
    path: '/tree/landing-v4',
    label: 'Landing V4: "Step Through Clarity"',
    description: 'Forward-nav cards: Point→Venn→Quadrant→Story→Explain-back→CTA. Design system, constellation dots'
  },
  {
    path: '/tree/loading-demo',
    label: 'Loading Animation Variants',
    description: 'Side-by-side comparison of loading animation variants'
  },
  {
    path: '/tree/usp-contrast',
    label: 'USP Contrast: Stories vs Points',
    description: 'Story/Point tab switcher (meaning vs validity) — cut from the coach landing 2026-06, preserved for future product/how-it-works use'
  },
  {
    path: '/tree/links-menu',
    label: 'Links menu + session line',
    description: 'Three shapes for a Links menu carrying instruments, 9 letters and tools; plus the /transcribe duplicate End Session'
  },
  {
    path: '/tree/event-transcription',
    label: 'P1307: Event Room Transcription',
    description: 'Clickable prototype — transcribe toggle on /ready, cross-page bar, transcript view, practice session. Mock state only.'
  },
  {
    path: '/tree/design-blue',
    label: 'Design decisions: primary blue',
    description: 'Three candidate primary blues (light, medium, dark navy) shown on the same mock screens'
  },
  {
    path: '/tree/compare-positions',
    label: 'Compare positions',
    description: 'Compare view for two people sharing one phone: where do we disagree most on the statements'
  },
  {
    path: '/tree/host-controls',
    label: 'Host controls',
    description: 'Three ways for an event host to override table seating, on the same mock room'
  },
  {
    path: '/tree/compare-entry',
    label: 'Compare entry on a profile',
    description: 'Two placements for the "Compare with me" button on a profile: header or Points tab'
  },
  {
    path: '/tree/p1336',
    label: 'P1336: Onboarding prototype',
    description: 'Clickable prototype of registration onboarding, default variant. Mock state only.'
  },
  {
    path: '/tree/p1336-c',
    label: 'P1336: Onboarding prototype (variant C)',
    description: 'The same onboarding prototype with the prepare-choice variant C'
  },
  {
    path: '/tree/p1336-d',
    label: 'P1336: Onboarding prototype (variant D)',
    description: 'The same onboarding prototype with variant D'
  },
  {
    path: '/tree/admin-users',
    label: 'Admin users lookup',
    description: 'Founder-only user search: find a person and open their profile. Mock data only.'
  },
];

const gateFixtures = [
  {
    path: '/tree/_gate/example',
    label: 'Gate fixture: example',
    description: 'Reference pattern for gate fixtures, with a URL-driven phase switch'
  },
  {
    path: '/tree/_gate/terms-update',
    label: 'Gate fixture: terms update',
    description: 'The terms-update popup, or the notice banner with ?phase=notice'
  },
  {
    path: '/tree/_gate/canvas-thread',
    label: 'Gate fixture: canvas thread',
    description: 'A canvas draft thread panel in its states (?phase=)'
  },
  {
    path: '/tree/_gate/canvas-workspace',
    label: 'Gate fixture: canvas workspace',
    description: 'The canvas workspace frame in its states (?phase=)'
  },
  {
    path: '/tree/_gate/canvas-draft',
    label: 'Gate fixture: canvas draft',
    description: 'The canvas page header and boxes in each draft state (?phase=)'
  },
];

const notFoundVariants = [
  {
    path: '/tree/404-drift',
    label: '404: Drift',
    description: 'Floating letters — gentle, ambient feel'
  },
  {
    path: '/tree/404-glitch',
    label: '404: Glitch',
    description: 'Text scramble + blur reveal — techy, modern'
  },
  {
    path: '/tree/404-compass',
    label: '404: Compass',
    description: 'Spinning needle that can\'t find north — playful, on-brand'
  },
];

type RouteEntry = { path: string; label: string; description: string };

function RouteList({ routes }: { routes: RouteEntry[] }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-border divide-y divide-gray-100 mb-6">
      {routes.map((route) => (
        <Link
          key={route.path}
          to={route.path}
          className="block px-4 py-3 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div>
              <span className="font-medium text-gray-900">{route.label}</span>
              <p className="text-sm text-gray-500 mt-0.5">{route.description}</p>
            </div>
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </Link>
      ))}
    </div>
  );
}

export function TreePage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Developer Pages</h1>
        <p className="text-sm text-gray-500 mb-6">
          Navigation hub for development and testing.
        </p>

        {/* Production Pages */}
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Production Pages
        </h2>
        <RouteList routes={productionPages} />

        {/* Dev Tools */}
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Dev Tools
        </h2>
        <RouteList routes={devPages} />

        {/* Gate Fixtures */}
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Gate fixtures
        </h2>
        <RouteList routes={gateFixtures} />

        {/* 404 Variants */}
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
          404 Page Variants
        </h2>
        <RouteList routes={notFoundVariants} />

        <div className="mt-6 text-center">
          <Link to="/" className="text-sm text-blue-600 hover:underline">
            Back to main app
          </Link>
        </div>
      </div>
    </div>
  );
}
