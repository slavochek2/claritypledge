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
        <div className="bg-white rounded-lg shadow-sm border border-border divide-y divide-gray-100 mb-6">
          {productionPages.map((route) => (
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

        {/* Dev Tools */}
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Dev Tools
        </h2>
        <div className="bg-white rounded-lg shadow-sm border border-border divide-y divide-gray-100 mb-6">
          {devPages.map((route) => (
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

        {/* 404 Variants */}
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
          404 Page Variants
        </h2>
        <div className="bg-white rounded-lg shadow-sm border border-border divide-y divide-gray-100 mb-6">
          {notFoundVariants.map((route) => (
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

        <div className="mt-6 text-center">
          <Link to="/" className="text-sm text-blue-600 hover:underline">
            Back to main app
          </Link>
        </div>
      </div>
    </div>
  );
}
