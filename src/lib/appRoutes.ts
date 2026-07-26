export function shouldShowMarketingLanding(pathname: string, search: string): boolean {
  if (pathname !== '/') return false;
  const params = new URLSearchParams(search);
  if (params.get('auth') === 'forgot') return false;
  if (params.has('highlight')) return false;
  if (params.has('action')) return false;
  return true;
}

export function shouldShowNightConsoleConcept(pathname: string): boolean {
  return pathname === '/concept/night-console';
}

export function shouldShowEditorialMotionPreview(pathname: string): boolean {
  return pathname === '/preview/editorial-motion';
}

export function shouldShowDashboardPreview(
  pathname: string,
  hostname: string,
): boolean {
  if (pathname !== '/preview/dashboard') return false;
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.endsWith('.vercel.app')
  );
}
