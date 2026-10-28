/**
 * @file point-detail-skeleton.tsx
 * @description P1586: the point page's loading placeholder, split out of point-detail-page.tsx.
 */

import { Skeleton } from '@/components/ui/skeleton';
import { FocusHeader } from '@/app/components/layout/focus-header';

export function PointDetailSkeleton({ isEmbed, fallback }: { isEmbed: boolean; fallback: string }) {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* P1364 UX Notes — loading: the top Back only (no pill until the content renders). */}
      {!isEmbed && <FocusHeader fallback={fallback} />}
      {/* Skeleton for point card */}
      <div className="bg-card border border-border rounded-lg overflow-hidden mb-4">
        <div className="border-l-4 border-border p-4">
          <div className="flex items-start gap-3">
            <Skeleton className="w-10 h-10 rounded-full" />
            <div className="flex-1">
              <Skeleton className="h-5 w-3/4 mb-3" />
              <div className="flex gap-2">
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-8 w-20" />
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Skeleton for positions section */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="flex border-b border-gray-100">
          <Skeleton className="flex-1 h-12 rounded-none" />
        </div>
        <div className="p-4 space-y-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      </div>
    </div>
  );
}
