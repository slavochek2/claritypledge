import { useLocation, useNavigate } from 'react-router-dom';
import { Radio, User } from 'lucide-react';

interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { path: '/prototype/linkedin-like/live', label: 'Live', icon: <Radio size={22} /> },
  { path: '/prototype/linkedin-like/profile', label: 'Profile', icon: <User size={22} /> },
];

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (path: string) => {
    if (path.includes('/live') && location.pathname.includes('/live')) return true;
    if (path.includes('/profile') && location.pathname.includes('/profile')) return true;
    return location.pathname === path;
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
      <div className="flex items-center justify-around h-14 max-w-lg mx-auto">
        {navItems.map((item) => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
              isActive(item.path)
                ? 'text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {item.icon}
            <span className="text-xs mt-0.5 font-medium">{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
