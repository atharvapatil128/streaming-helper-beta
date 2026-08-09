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

export function shouldShowHelpPage(pathname: string): boolean {
  return pathname === '/help';
}

export function shouldShowPrivacyPage(pathname: string): boolean {
  return pathname === '/privacy';
}

const PUBLIC_SEARCH_PATHS = new Set([
  '/how-it-works',
  '/extension-permissions',
  '/supported-streaming-services',
  '/share-show-recommendations',
  '/save-tv-show-recommendations',
  '/chrome-extension-show-recommendations',
]);

export function shouldShowPublicSearchPage(pathname: string): boolean {
  const normalized = pathname !== '/' ? pathname.replace(/\/$/, '') : '/';
  return PUBLIC_SEARCH_PATHS.has(normalized);
}

export function isPrivateAppRoute(pathname: string, search: string): boolean {
  if (
    pathname === '/app' ||
    pathname === '/update-password' ||
    pathname === '/invite' ||
    pathname.startsWith('/invite/') ||
    pathname.startsWith('/concept/') ||
    pathname.startsWith('/preview/')
  ) {
    return true;
  }

  if (pathname !== '/') return false;
  const params = new URLSearchParams(search);
  return params.has('auth') || params.has('highlight') || params.has('action');
}

export function isKnownApplicationRoute(pathname: string, search: string): boolean {
  return (
    shouldShowMarketingLanding(pathname, search) ||
    shouldShowHelpPage(pathname) ||
    shouldShowPrivacyPage(pathname) ||
    shouldShowPublicSearchPage(pathname) ||
    isPrivateAppRoute(pathname, search)
  );
}
