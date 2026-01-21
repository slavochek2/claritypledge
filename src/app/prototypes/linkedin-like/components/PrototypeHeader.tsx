import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Plus, ChevronDown, User, Settings, LogOut, Compass, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { currentUser } from '../data/mock-data';

export function PrototypeHeader() {
  const navigate = useNavigate();
  const location = useLocation();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const isOnLive = location.pathname.includes('/live');

  return (
    <header className="sticky top-0 bg-white border-b border-gray-200 z-50">
      <div className="max-w-4xl mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          {/* Logo - links to profile (home) */}
          <Link
            to="/prototype/linkedin-like/profile"
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">
              C
            </div>
            <span className="font-semibold text-gray-900 hidden sm:block">Clarity</span>
          </Link>

          {/* Right side: New Meeting + Avatar */}
          <div className="flex items-center gap-3">
            {/* New Meeting button */}
            <Button
              onClick={() => navigate('/prototype/linkedin-like/live')}
              size="sm"
              className={
                isOnLive
                  ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                  : 'bg-blue-500 hover:bg-blue-600 text-white'
              }
            >
              <Plus size={16} />
              <span>New Meeting</span>
            </Button>

            {/* Avatar dropdown */}
            <div className="relative">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-1 p-1 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-lg">
                  {currentUser.avatar}
                </div>
                <ChevronDown size={16} className="text-gray-500" />
              </button>

              {dropdownOpen && (
                <>
                  {/* Backdrop */}
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setDropdownOpen(false)}
                  />

                  {/* Dropdown menu */}
                  <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1">
                    {/* Navigation items - hidden on mobile where bottom nav shows */}
                    <div className="hidden sm:block">
                      <Link
                        to="/prototype/linkedin-like/explore"
                        onClick={() => setDropdownOpen(false)}
                        className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <Compass size={16} />
                        Explore
                      </Link>
                      <Link
                        to="/prototype/linkedin-like/live"
                        onClick={() => setDropdownOpen(false)}
                        className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <Radio size={16} />
                        Live
                      </Link>
                      <div className="border-t border-gray-100 my-1" />
                    </div>

                    <Link
                      to="/prototype/linkedin-like/profile"
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <User size={16} />
                      My Profile
                    </Link>

                    <button
                      onClick={() => {
                        setDropdownOpen(false);
                        // Settings - placeholder for now
                      }}
                      className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <Settings size={16} />
                      Settings
                    </button>

                    <div className="border-t border-gray-100 my-1" />

                    <button
                      onClick={() => {
                        setDropdownOpen(false);
                        // Logout - for prototype, just go to landing or show message
                        navigate('/');
                      }}
                      className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-600 hover:bg-gray-50"
                    >
                      <LogOut size={16} />
                      Logout
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
