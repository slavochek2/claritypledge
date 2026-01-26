import type { ReactNode } from 'react';

interface ThreadLineItemProps {
  children: ReactNode;
  isLast?: boolean;
}

/**
 * Single item in a thread. Shows horizontal connector to the vertical spine.
 * The vertical line comes from ThreadLineGroup - this just adds the branch.
 *
 * For the last item, we overlay a background to hide the vertical line below the connector.
 */
export function ThreadLineItem({ children, isLast = false }: ThreadLineItemProps) {
  return (
    <div className="relative pl-4">
      {/* Horizontal connector branch */}
      <div className="absolute left-0 top-5 w-3 h-0.5 bg-gray-200" />
      {/* For last item: cover the vertical line below the connector */}
      {isLast && (
        <div className="absolute -left-[2px] top-5 bottom-0 w-1 bg-white" />
      )}
      {/* Content */}
      <div className="pl-1">{children}</div>
    </div>
  );
}

interface ThreadLineGroupProps {
  children: ReactNode;
}

/**
 * Container that provides the continuous vertical spine for thread lines.
 * The vertical line spans the full height - individual items add horizontal branches.
 */
export function ThreadLineGroup({ children }: ThreadLineGroupProps) {
  return (
    <div className="relative ml-2 mt-2">
      {/* Continuous vertical spine - spans full height of all children */}
      <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gray-200" />
      {/* Children with spacing */}
      <div className="pt-2 space-y-3">{children}</div>
    </div>
  );
}
