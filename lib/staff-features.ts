export const STAFF_FEATURES = Object.freeze({
  home: true,
  schedule: true,
  requests: true,
  timeOff: true,
  availability: true,
  shiftCoverage: true,
  shiftTrades: true,
  openShifts: true,
  communications: true,
  directMessages: true,
  groupChats: false,
  systemChannels: false,
  announcements: true,
  team: true,
  notifications: true,
  notificationPreferences: true,
  account: true,
  tutorials: false,
  support: false,
  training: false,
  timeClock: false,
  tips: false,
  earnings: false,
  financialFeatures: false,
  toastFeatures: false,
} as const);

export type StaffFeature = keyof typeof STAFF_FEATURES;

export function staffFeatureEnabled(feature: StaffFeature): boolean {
  return STAFF_FEATURES[feature] === true;
}

type RouteReleaseRule = {prefix: string; feature: StaffFeature};

// Most-specific employee routes first. Routes not listed here remain governed by
// normal authentication/authorization; this table controls product release only.
const STAFF_ROUTE_RELEASE_RULES: readonly RouteReleaseRule[] = [
  {prefix: '/employee/notifications/preferences', feature: 'notificationPreferences'},
  {prefix: '/employee/notifications', feature: 'notifications'},
  {prefix: '/employee/shift-pool', feature: 'openShifts'},
  {prefix: '/employee/time-clock', feature: 'timeClock'},
  {prefix: '/employee/training', feature: 'training'},
  {prefix: '/employee/requests', feature: 'requests'},
  {prefix: '/employee/schedule', feature: 'schedule'},
  {prefix: '/employee/team', feature: 'communications'},
  {prefix: '/employee/more', feature: 'account'},
  {prefix: '/employee/tips', feature: 'tips'},
  {prefix: '/employee', feature: 'home'},
];

function routeMatches(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function staffRouteFeature(pathname: string): StaffFeature | null {
  const normalized = (pathname || '/').split(/[?#]/, 1)[0] || '/';
  return STAFF_ROUTE_RELEASE_RULES.find((rule) => routeMatches(normalized, rule.prefix))?.feature ?? null;
}

export function isStaffRouteReleased(pathname: string): boolean {
  const feature = staffRouteFeature(pathname);
  return feature ? staffFeatureEnabled(feature) : true;
}

type StaffNotificationLike = {
  href?: string | null;
  category?: string | null;
  event_key?: string | null;
  type?: string | null;
};

const FEATURE_NOTIFICATION_PREFIXES: Readonly<Record<'training' | 'timeClock' | 'tips' | 'earnings', readonly string[]>> = {
  training: ['training', 'course', 'quiz'],
  timeClock: ['time_clock', 'clock_', 'punch_', 'timecard'],
  tips: ['tip_', 'tips', 'tip_pool'],
  earnings: ['earnings', 'payroll', 'wage_'],
};

function normalizedNotificationTokens(value: StaffNotificationLike): string[] {
  return [value.category, value.event_key, value.type]
    .filter((token): token is string => Boolean(token))
    .map((token) => token.trim().toLowerCase());
}

export function isStaffNotificationReleased(value: StaffNotificationLike): boolean {
  if (value.href && !isStaffRouteReleased(value.href)) return false;
  const tokens = normalizedNotificationTokens(value);
  for (const [feature, prefixes] of Object.entries(FEATURE_NOTIFICATION_PREFIXES) as Array<[
    keyof typeof FEATURE_NOTIFICATION_PREFIXES,
    readonly string[],
  ]>) {
    if (staffFeatureEnabled(feature) || !tokens.length) continue;
    if (tokens.some((token) => prefixes.some((prefix) => token === prefix || token.startsWith(prefix)))) return false;
  }
  return true;
}
