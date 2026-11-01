import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Short links to community chat invites (/basket, /basketball).
 *
 * The invite URLs are NOT committed: this repo is public and bots scrape GitHub for
 * chat.whatsapp.com links. A leaked link is replaced by resetting it in WhatsApp, then
 * updating the env var and redeploying (Vercel applies env changes to NEW deployments
 * only), with no code change.
 *
 * Configuration (Vercel project env — NOT committed):
 *   JOIN_BASKETBALL_URL = the group's WhatsApp invite URL
 *
 * Unset env var or unknown group → /events, so a missing value sends people to a real
 * page, not a 500. no-store: a cached 307 must never outlive a reset invite.
 */

export default function handler(req: VercelRequest, res: VercelResponse) {
  const group = typeof req.query.group === 'string' ? req.query.group : '';
  const target = group === 'basketball' ? process.env.JOIN_BASKETBALL_URL : undefined;
  res.setHeader('Cache-Control', 'no-store');
  res.redirect(307, target || '/events');
}
