import { RealBadgeService } from './badge-service-real';
export const badgeService = new RealBadgeService();
export type { BadgePoint, BadgePosition, BadgeService } from './badge-service.interface';
