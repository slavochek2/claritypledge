import { Link } from 'react-router-dom';

const routes = [
  { path: '/feed', label: 'Feed', description: 'Browse and vote on ideas' },
  { path: '/chat', label: 'Chat', description: 'Chat interface' },
  { path: '/demo', label: 'Demo', description: 'Original demo page' },
  { path: '/prototype/premium/feed', label: 'Prototype', description: 'Premium prototype (Apple-style)' },
  { path: '/prototype/converged/profile', label: 'Converged Profile', description: 'P32.3 converged prototype - Profile view' },
];

const recentFixes = [
  {
    date: '2026-01-06',
    title: 'Fixed P32.4 documentation paths',
    description: 'Corrected 7 files that incorrectly referenced /prototype/premium instead of /prototype/converged',
    files: [
      'p32_4_00b_design_system_unification.md',
      'p32_4_05_profile_redesign_after_04.md',
      'p32_4_08b_prototype_live_session.md',
      'p32_4_09_wire_prototype_to_live.md',
      'p32_4_10_create_idea_during_live.md',
      'p32_4_final_review_checklist.md',
      'p32_4_improvements_summary.md',
    ],
  },
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

        <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">Recent Fixes</h2>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          {recentFixes.map((fix, idx) => (
            <div key={idx} className="mb-6 last:mb-0">
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-xs text-gray-500">{fix.date}</span>
                <h3 className="font-semibold text-gray-900">{fix.title}</h3>
              </div>
              <p className="text-sm text-gray-600 mb-2">{fix.description}</p>
              <details className="text-xs">
                <summary className="cursor-pointer text-blue-600 hover:text-blue-700">
                  Show affected files ({fix.files.length})
                </summary>
                <ul className="mt-2 space-y-1 ml-4 list-disc text-gray-600">
                  {fix.files.map((file) => (
                    <li key={file}>{file}</li>
                  ))}
                </ul>
              </details>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
