/**
 * @file certificate-page-shell.tsx
 * @description P482: Shared width wrapper for all certificate-rendering pages.
 * Ensures consistent max-w-3xl (768px) across agreement detail, create, and accept views.
 */

interface CertificatePageShellProps {
  children: React.ReactNode;
  className?: string;
  /** Adds min-h-screen parchment background (used by accept-agreement-page) */
  parchment?: boolean;
}

export function CertificatePageShell({ children, className, parchment }: CertificatePageShellProps) {
  const inner = (
    <div data-testid="certificate-page-shell" className={`max-w-3xl mx-auto px-4 ${className ?? ''}`}>
      {children}
    </div>
  );

  if (parchment) {
    return <div className="min-h-screen bg-[#F5F3EF]">{inner}</div>;
  }

  return inner;
}
