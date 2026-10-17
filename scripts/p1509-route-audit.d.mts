export interface RouteRow {
  path: string;
  file: string;
  line: number;
  devOnly: boolean;
  redirect: boolean;
}
export interface UnreadRoute {
  file: string;
  line: number;
  reason: string;
  text: string;
}
export interface RouteAudit {
  rows: RouteRow[];
  unread: UnreadRoute[];
  mounts: Array<{ path: string; file: string }>;
}
export interface AuditOptions {
  source?: string;
  root?: string;
}
export function composePath(parent: string, child: string): string;
export function auditRoutes(entryFile?: string, opts?: AuditOptions): RouteAudit;
export function auditSource(source: string, fileName?: string, opts?: Omit<AuditOptions, 'source'>): RouteAudit;
export function listRoutes(rows: RouteRow[]): RouteRow[];
