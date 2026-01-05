import { Link } from 'react-router-dom';

const routes = [
  { path: '/feed', label: 'Feed', description: 'Browse and vote on ideas' },
  { path: '/chat', label: 'Chat', description: 'Chat interface' },
  { path: '/demo', label: 'Demo', description: 'Original demo page' },
  { path: '/alternative', label: 'Alternative', description: 'Alternative landing page' },
  { path: '/prototype/premium/feed', label: 'Prototype', description: 'Premium prototype (Apple-style)' },
];

export function TreePage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Prototypes</h1>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 divide-y divide-gray-100">
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
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
