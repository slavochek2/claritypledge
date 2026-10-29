/**
 * @file canvas-box-icon.tsx
 * @description The canvas's box icon in a small tinted circle, like the pin on every point card.
 */
import { BarChart3, CircleAlert, Coins, Contrast, Gem, Handshake, Lightbulb, Megaphone, Users, type LucideIcon } from 'lucide-react';
import type { CanvasBoxTag } from '@/lib/canvas-boxes';

/** A small icon per box, so the canvas can be scanned by shape as well as by title. */
const BOX_ICONS: Record<CanvasBoxTag, LucideIcon> = {
  'canvas:segments': Users,
  'canvas:problem': CircleAlert,
  'canvas:solution': Lightbulb,
  'canvas:channels': Megaphone,
  'canvas:revenue': Coins,
  'canvas:metrics': BarChart3,
  'canvas:love': Gem,
  'canvas:good-at': Contrast,
  'canvas:world-needs': Handshake,
};

export function BoxIcon({ tag, className = '' }: { tag: CanvasBoxTag; className?: string }) {
  const Icon = BOX_ICONS[tag];
  return (
    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600 ${className}`.trim()} data-testid="canvas-box-icon">
      <Icon aria-hidden className="h-4 w-4" />
    </span>
  );
}
