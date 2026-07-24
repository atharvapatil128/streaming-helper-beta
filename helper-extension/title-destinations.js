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
    const actions = platforms.map(actionForPlatform).filter(Boolean);
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
    const expected = ['destination', 'mediaType', 'title', 'tmdbId', 'type'];
    const actual = Object.keys(message).sort();
    if (actual.length !== expected.length ||
        !actual.every(function (key, index) { return key === expected[index]; })) {
      return false;
    }
    if (message.type !== 'OPEN_TITLE_DESTINATION' || buildUrl(message) === null) return false;
    if (message.destination === 'tmdb') {
      return validTmdbId(message.tmdbId) &&
        canonicalMediaType(message.mediaType) !== null;
    }
    return message.tmdbId === null && message.mediaType === null;
  }

  scope.StreamingHelperTitleDestinations = Object.freeze({
    canonicalPlatform,
    titleActions,
    buildUrl,
    validOpenMessage,
  });
})(globalThis);
