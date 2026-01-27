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
    <div className="min-h-screen bg-gray-50">
      {!hideHeader && <PrototypeHeader />}
      <main className={`
        ${!hideHeader ? 'pt-16 lg:pt-20' : ''}
        ${!hideBottomNav ? 'pb-20 lg:pb-0' : ''}
        ${className}
      `}>
        {children}
      </main>
      {!hideBottomNav && <BottomNav />}
    </div>
  );
}
