export function shouldShowMarketingLanding(pathname: string, search: string): boolean {
  if (pathname !== '/') return false;
  const params = new URLSearchParams(search);
  if (params.get('auth') === 'forgot') return false;
  if (params.has('highlight')) return false;
  if (params.has('action')) return false;
  return true;
}
