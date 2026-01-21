import { PrototypeHeader } from './PrototypeHeader';
import { BottomNav } from './BottomNav';

interface PrototypeLayoutProps {
  children: React.ReactNode;
  /** Hide the header (e.g., during active Live meeting) */
  hideHeader?: boolean;
  /** Hide the bottom nav (e.g., during active Live meeting) */
  hideBottomNav?: boolean;
  /** Additional class for the main content area */
  className?: string;
}

export function PrototypeLayout({ children, hideHeader = false, hideBottomNav = false, className = '' }: PrototypeLayoutProps) {
  return (
    <div className="min-h-screen bg-gray-100">
      {!hideHeader && <PrototypeHeader />}
      <main className={`${className} ${!hideBottomNav ? 'pb-16 sm:pb-0' : ''}`}>
        {children}
      </main>
      {!hideBottomNav && <BottomNav />}
    </div>
  );
}
