import { Link } from 'react-router-dom';

const productionPages = [
  {
    path: '/feed',
    label: 'Feed',
    description: 'Browse and vote on ideas'
  },
  {
    path: '/create',
    label: 'Create Story',
    description: 'Create a new story'
  },
  {
    path: '/demo',
    label: 'Demo',
    description: 'Original demo page'
  },
];

const prototypeRoutes = [
  {
    path: '/prototype/events-mock',
    label: 'Events (Mock Data)',
    description: 'Hardcoded events — safe for testing, works in prod'
  },
  {
    path: '/prototype/linkedin-like/profile',
    label: 'LinkedIn-like',
    description: 'P55 - Idea verification with swipe interface'
  },
  {
    path: '/prototype/premium/feed',
    label: 'Premium Prototype',
    description: 'P32 - Apple-style premium design'
  },
  {
    path: '/prototype/converged/feed',
    label: 'Converged Prototype',
    description: 'P32.3 - Unified design system'
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
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 divide-y divide-gray-100 mb-6">
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

        {/* Prototypes */}
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Prototypes
        </h2>
        <p className="text-xs text-gray-400 mb-2">
          Isolated experimental features with mock data.
        </p>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 divide-y divide-gray-100">
          {prototypeRoutes.map((route) => (
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
