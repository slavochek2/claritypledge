/**
 * @file usePointsForDisplay.ts
 * @description P151: React hooks for efficient point loading with positions
 *
 * These hooks encapsulate the batch loading pattern for displaying points
 * with position counts and user positions. They handle loading states,
 * error states, and automatically refetch when auth context changes.
 */

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/auth';
import { pointsService } from '@/app/data/points-service';
import type { PointWithUserPosition } from '@/app/types';

interface UsePointsForProfileResult {
  points: PointWithUserPosition[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Load points for a user's profile with automatic position loading
 *
 * Handles:
 * - Loading state
 * - Error handling
 * - Re-fetching when viewer changes (login/logout)
 * - Batch position loading (efficient, no N+1 queries)
 *
 * @param profileId - User whose points to load
 * @returns Points with loading state and refetch function
 *
 * @example
 * function ProfilePage({ profileId }) {
 *   const { points, loading, error } = usePointsForProfile(profileId);
 *
 *   if (loading) return <Spinner />;
 *   if (error) return <Error error={error} />;
 *
 *   return points.map(point => <PointCard key={point.id} point={point} />);
 * }
 */
export function usePointsForProfile(profileId: string): UsePointsForProfileResult {
  const { user } = useAuth();
  const [points, setPoints] = useState<PointWithUserPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const load = async () => {
    if (!isMountedRef.current) return;
    setLoading(true);
    setError(null);
    try {
      const data = await pointsService.getPointsForProfileDisplay(
        profileId,
        user?.id
      );
      if (isMountedRef.current) setPoints(data);
    } catch (err) {
      console.error('Failed to load points for profile:', err);
      if (isMountedRef.current) setError(err as Error);
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, user?.id]); // Re-fetch when profile or viewer changes

  return {
    points,
    loading,
    error,
    refetch: load,
  };
}

/**
 * Load points for feed/discovery with automatic position loading
 *
 * Handles:
 * - Loading state
 * - Error handling
 * - Re-fetching when viewer changes (login/logout)
 * - Pagination
 * - Batch position loading (efficient, no N+1 queries)
 *
 * @param limit - Number of points per page
 * @param offset - Pagination offset
 * @returns Points with loading state and refetch function
 *
 * @example
 * function FeedPage({ page }) {
 *   const { points, loading, error } = usePointsForFeed(20, page * 20);
 *
 *   if (loading) return <Spinner />;
 *   if (error) return <Error error={error} />;
 *
 *   return points.map(point => <PointCard key={point.id} point={point} />);
 * }
 */
export function usePointsForFeed(
  limit: number,
  offset: number
): UsePointsForProfileResult {
  const { user } = useAuth();
  const [points, setPoints] = useState<PointWithUserPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const load = async () => {
    if (!isMountedRef.current) return;
    setLoading(true);
    setError(null);
    try {
      const data = await pointsService.getPointsForFeedDisplay(
        limit,
        offset,
        user?.id
      );
      if (isMountedRef.current) setPoints(data);
    } catch (err) {
      console.error('Failed to load points for feed:', err);
      if (isMountedRef.current) setError(err as Error);
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit, offset, user?.id]); // Re-fetch when pagination or viewer changes

  return {
    points,
    loading,
    error,
    refetch: load,
  };
}
