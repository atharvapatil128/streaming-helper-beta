/**
 * Pure, shared title-destination rules for extension UI and background worker.
 * The content script receives action metadata only; the trusted worker builds
 * the final allowlisted URL immediately before opening a tab.
 */
(function (scope) {
  'use strict';

  const PLATFORM_DEFINITIONS = Object.freeze({
    netflix: Object.freeze({
      label: 'Netflix',
      aliases: Object.freeze(['netflix']),
    }),
    primevideo: Object.freeze({
      label: 'Prime Video',
      aliases: Object.freeze([
        'prime video',
        'primevideo',
        'prime',
        'amazon prime video',
      ]),
    }),
    hulu: Object.freeze({
      label: 'Hulu',
      aliases: Object.freeze(['hulu']),
    }),
  });
  const DESTINATIONS = Object.freeze([
    ...Object.keys(PLATFORM_DEFINITIONS),
    'netflix_direct',
    'primevideo_direct',
    'tmdb',
  ]);
  const MEDIA_TYPES = Object.freeze(['movie', 'series', 'tv', 'show']);

  function cleanTitle(value) {
    if (typeof value !== 'string') return null;
    if (/[\u0000-\u001f\u007f]/.test(value)) return null;
    const title = value.replace(/\s+/g, ' ').trim();
    if (!title || title.length > 200) return null;
    return title;
  }

  function canonicalPlatform(value) {
    if (typeof value !== 'string') return null;
    const key = value.trim().toLowerCase();
    for (const [id, definition] of Object.entries(PLATFORM_DEFINITIONS)) {
      if (definition.aliases.includes(key)) return id;
    }
    return null;
  }

  function canonicalMediaType(value) {
    if (typeof value !== 'string') return null;
    const key = value.trim().toLowerCase();
    return MEDIA_TYPES.includes(key) ? key : null;
  }

  function validTmdbId(value) {
    return Number.isSafeInteger(value) && value > 0;
  }

  function validProviderReference(providerKey, providerRef) {
    if (providerKey === 'netflix') {
      return typeof providerRef === 'string' &&
        /^watch\/[1-9][0-9]{4,19}$/.test(providerRef);
    }
    if (providerKey === 'prime_video') {
      return typeof providerRef === 'string' &&
        /^detail\/[A-Z0-9]{10,40}$/.test(providerRef);
    }
    return false;
  }

  function providerReferenceFromUrl(value) {
    if (typeof value !== 'string') return null;
    let url;
    try {
      url = new URL(value);
    } catch (_) {
      return null;
    }
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase();
    let match;
    if (host === 'www.netflix.com' &&
        (match = url.pathname.match(/^\/watch\/([1-9][0-9]{4,19})\/?$/))) {
      return Object.freeze({
        providerKey: 'netflix',
        providerRef: `watch/${match[1]}`,
      });
    }
    if (host === 'www.primevideo.com' &&
        (match = url.pathname.match(
          /^\/(?:gp\/video\/)?detail\/([A-Z0-9]{10,40})(?:\/ref=[A-Za-z0-9_-]{1,100})?\/?$/
        ))) {
      return Object.freeze({
        providerKey: 'prime_video',
        providerRef: `detail/${match[1]}`,
      });
    }
    return null;
  }

  function directAction(providerKey, providerRef) {
    if (!validProviderReference(providerKey, providerRef)) return null;
    if (providerKey === 'netflix') {
      return Object.freeze({
        destination: 'netflix_direct',
        label: 'Open on Netflix',
        platformLabel: 'Netflix',
        kind: 'direct',
        providerRef,
      });
    }
    return Object.freeze({
      destination: 'primevideo_direct',
      label: 'Open on Prime Video',
      platformLabel: 'Prime Video',
      kind: 'direct',
      providerRef,
    });
  }

  function actionForPlatform(destination) {
    const definition = PLATFORM_DEFINITIONS[destination];
    if (!definition) return null;
    return Object.freeze({
      destination,
      label: `Search on ${definition.label}`,
      platformLabel: definition.label,
      kind: 'search',
    });
  }

  function titleActions(item, currentPlatform) {
    const title = cleanTitle(item?.title);
    if (!title) return [];
    const rawPlatforms = Array.isArray(item?.platforms)
      ? item.platforms
      : [item?.platform];
    const platforms = [];
    for (const raw of rawPlatforms.slice(0, 10)) {
      const canonical = canonicalPlatform(raw);
      if (canonical && !platforms.includes(canonical)) platforms.push(canonical);
    }
    const current = canonicalPlatform(currentPlatform);
    if (current && platforms.includes(current)) {
      platforms.splice(platforms.indexOf(current), 1);
      platforms.unshift(current);
    }
    const actions = [];
    const direct = directAction(item?.providerKey, item?.providerRef);
    if (direct) actions.push(direct);
    actions.push(...platforms.map(actionForPlatform).filter(Boolean));
    if (validTmdbId(item?.tmdbId) && canonicalMediaType(item?.mediaType)) {
      actions.push(Object.freeze({
        destination: 'tmdb',
        label: 'View title details',
        platformLabel: 'TMDB',
        kind: 'details',
      }));
    }
    return actions;
  }

  function buildUrl(input) {
    const title = cleanTitle(input?.title);
    if (!title || !DESTINATIONS.includes(input?.destination)) return null;
    const encodedTitle = encodeURIComponent(title);
    switch (input.destination) {
      case 'netflix':
        return `https://www.netflix.com/search?q=${encodedTitle}`;
      case 'primevideo':
        return `https://www.primevideo.com/search/ref=atv_nb_sr?phrase=${encodedTitle}`;
      case 'hulu':
        return `https://www.hulu.com/search?q=${encodedTitle}`;
      case 'netflix_direct':
        return validProviderReference('netflix', input.providerRef)
          ? `https://www.netflix.com/${input.providerRef}` : null;
      case 'primevideo_direct':
        return validProviderReference('prime_video', input.providerRef)
          ? `https://www.primevideo.com/${input.providerRef}` : null;
      case 'tmdb': {
        const mediaType = canonicalMediaType(input.mediaType);
        if (!validTmdbId(input.tmdbId) || !mediaType) return null;
        const kind = mediaType === 'movie' ? 'movie' : 'tv';
        return `https://www.themoviedb.org/${kind}/${input.tmdbId}`;
      }
      default:
        return null;
    }
  }

  function validOpenMessage(message) {
    if (!message || typeof message !== 'object' || Array.isArray(message)) return false;
    const expected = ['destination', 'mediaType', 'providerRef', 'title', 'tmdbId', 'type'];
    const actual = Object.keys(message).sort();
    if (actual.length !== expected.length ||
        !actual.every(function (key, index) { return key === expected[index]; })) {
      return false;
    }
    if (message.type !== 'OPEN_TITLE_DESTINATION' || buildUrl(message) === null) return false;
    if (message.destination === 'tmdb') {
      return message.providerRef === null && validTmdbId(message.tmdbId) &&
        canonicalMediaType(message.mediaType) !== null;
    }
    if (message.destination === 'netflix_direct') {
      return message.tmdbId === null && message.mediaType === null &&
        validProviderReference('netflix', message.providerRef);
    }
    if (message.destination === 'primevideo_direct') {
      return message.tmdbId === null && message.mediaType === null &&
        validProviderReference('prime_video', message.providerRef);
    }
    return message.tmdbId === null && message.mediaType === null &&
      message.providerRef === null;
  }

  scope.StreamingHelperTitleDestinations = Object.freeze({
    canonicalPlatform,
    validProviderReference,
    providerReferenceFromUrl,
    titleActions,
    buildUrl,
    validOpenMessage,
  });
})(globalThis);
