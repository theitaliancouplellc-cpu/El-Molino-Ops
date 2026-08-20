const MANAGER_EXACT_PATHS = new Set<string>([
  '/manager/workspace',
  '/manager/tutorials',
  '/schedule',
  '/schedule/publish',
  '/schedule/requests',
  '/schedule/pool',
  '/employee/schedule',
  '/employee/requests',
  '/employee/shift-pool',
  '/employee/team',
  '/employee/notifications',
  '/employee/notifications/preferences',
  '/employee/more',
  '/employee/support',
  '/account',
  '/privacy',
  '/support',
  '/delete-account',
]);

function normalizedPath(pathname: string): string {
  return (pathname || '/').split(/[?#]/, 1)[0] || '/';
}

export function isManagerWorkspacePathAllowed(pathname: string): boolean {
  return MANAGER_EXACT_PATHS.has(normalizedPath(pathname));
}

export const MANAGER_WORKSPACE_HOME = '/manager/workspace';
