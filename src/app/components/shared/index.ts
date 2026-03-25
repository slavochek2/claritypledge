/**
 * @file index.ts
 * @description Barrel exports for shared components extracted from prototypes.
 * Production code imports from here instead of prototypes/linkedin-like/components/shared.
 */

export { FilterTabs, type PositionFilter } from './FilterTabs';
export { PointHeader } from './PointHeader';
export { PositionBadge, getPositionVerb } from './PositionBadge';
export { PositionButton, PositionButtons, type SevenPointCounts, type FivePointCounts } from './PositionButton';
export { RatingDots, RatingDotsPending } from './RatingDots';
export { VerifyButton } from './VerifyButton';
export { ShareButton, ShareDialog } from './ShareDialog';
export { ThreadLineItem, ThreadLineGroup } from './ThreadLine';
export { MobileTooltip } from './mobile-tooltip';
export { VisibilityBadge, CardVisibilityCornerBadge, InlineVisibilityIcon } from './visibility-badge';
