/**
 * @file anon-position-cta.tsx
 * @description P502: Inline CTA shown below position buttons when an anonymous user
 * has selected a position. Prompts signup/login to persist the position.
 *
 * Matches P490 live session hint style: text-xs text-gray-500, mt-1.5 spacing.
 */

import { useEffect } from 'react';
import { buildAuthGateUrl, toAuthGatePosition } from '@/lib/auth-gate-utils';
import { analytics } from '@/lib/mixpanel';

interface AnonPositionCTAProps {
  pointId: string;
  position: string;
  isEmbed?: boolean;
}

export function AnonPositionCTA({ pointId, position, isEmbed }: AnonPositionCTAProps) {
  const authGatePosition = toAuthGatePosition(position);

  useEffect(() => {
    if (authGatePosition) {
      analytics.track('anon_position_cta_shown', { point_id: pointId });
    }
  }, [pointId, authGatePosition]);

  if (!authGatePosition) return null;

  const signupUrl = buildAuthGateUrl({
    action: 'set-position',
    pointId,
    position: authGatePosition,
    redirect: isEmbed
      ? `/point/${pointId}`
      : (window.location.pathname === '/login' || window.location.pathname === '/signup')
        ? '/'
        : window.location.pathname + window.location.search,
  });

  const loginUrl = signupUrl.replace('/signup?', '/login?');

  const linkClass = 'text-blue-600 hover:text-blue-700';
  const target = isEmbed ? '_blank' : undefined;
  const rel = isEmbed ? 'noopener noreferrer' : undefined;

  return (
    <p className="mt-1.5 text-xs text-gray-500">
      {isEmbed && 'Join ClarityPledge \u2014 '}
      <a
        href={signupUrl}
        className={linkClass}
        target={target}
        rel={rel}
        onClick={() => analytics.track('anon_position_cta_clicked', { story_id: undefined, point_id: pointId, action: 'signup' })}
      >
        Sign up
      </a>
      {' or '}
      <a
        href={loginUrl}
        className={linkClass}
        target={target}
        rel={rel}
        onClick={() => analytics.track('anon_position_cta_clicked', { story_id: undefined, point_id: pointId, action: 'login' })}
      >
        log in
      </a>
      {' to save your position'}
    </p>
  );
}
