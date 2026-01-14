import { PrototypeHeader } from './PrototypeHeader';

interface PrototypeLayoutProps {
  children: React.ReactNode;
  /** Hide the header (e.g., during active Live meeting) */
  hideHeader?: boolean;
  /** Additional class for the main content area */
  className?: string;
}

export function PrototypeLayout({ children, hideHeader = false, className = '' }: PrototypeLayoutProps) {
  return (
    <div className="min-h-screen bg-gray-100">
      {!hideHeader && <PrototypeHeader />}
      <main className={className}>
        {children}
      </main>
    </div>
  );
}
