/**
 * @file profile-content-skeleton.tsx
 * @description P1586: the placeholder for a profile's stories/points list, split out of profile-page-v2.tsx.
 */

import { Skeleton } from "@/components/ui/skeleton";

export function ProfileContentSkeleton() {
  return (
    <div className="space-y-4 transition-opacity duration-300" data-testid="profile-content-skeleton">
      <Skeleton className="h-24 rounded-lg" />
      <Skeleton className="h-24 rounded-lg" />
      <Skeleton className="h-24 rounded-lg" />
    </div>
  );
}
