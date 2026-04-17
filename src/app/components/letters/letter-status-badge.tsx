/**
 * @file letter-status-badge.tsx
 * @description P581 Task 12: Status badge for letter deliveries.
 * Shows: Sent (gray), In Progress (blue), Completed (green-success).
 */

import type { DeliveryStatus } from '@/app/types';

interface LetterStatusBadgeProps {
  status: DeliveryStatus;
}

const statusConfig: Record<DeliveryStatus, { label: string; className: string }> = {
  sent: {
    label: 'Sent',
    className: 'bg-gray-100 text-gray-600',
  },
  opened: {
    label: 'Opened',
    className: 'bg-blue-50 text-blue-600',
  },
  in_progress: {
    label: 'In Progress',
    className: 'bg-blue-50 text-blue-600',
  },
  completed: {
    label: 'Completed',
    className: 'bg-green-50 text-green-700',
  },
};

export function LetterStatusBadge({ status }: LetterStatusBadgeProps) {
  const config = statusConfig[status] ?? statusConfig.sent;

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${config.className}`}
    >
      {config.label}
    </span>
  );
}
