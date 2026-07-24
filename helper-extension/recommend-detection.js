/**
 * Pure watch-screen routing rules shared by the recommendation content script
 * and its behavioral tests. DOM visibility remains in recommend.js.
 */
(function (scope) {
  'use strict';

  const WATCH_PATHS = Object.freeze({
    netflix: [/^\/watch\/\d+/i],
    disneyplus: [/\/video\//i, /\/play\//i],
    hulu: [/\/watch\//i],
    max: [/\/video\/watch\//i, /\/watch\//i],
  });

  function pathMatches(platform, pathname) {
    const patterns = WATCH_PATHS[platform] || [];
    return patterns.some(function (pattern) { return pattern.test(pathname); });
  }

  function watchStatus(platform, pathname, primeState) {
    if (platform !== 'primevideo') {
      return pathMatches(platform, pathname) ? 'watch' : 'detail';
    }
    if (!/\/(?:gp\/video\/)?detail\//i.test(pathname)) return 'detail';
    if (primeState?.hasExposedDetailTitle === true) return 'detail';
    if (primeState?.hasLargePlayer === true) return 'watch';
    return 'unknown';
  }

  function isPrimeWatchScreen(pathname, state) {
    return watchStatus('primevideo', pathname, state) === 'watch';
  }

  function isWatchScreen(platform, pathname, primeState) {
    return watchStatus(platform, pathname, primeState) === 'watch';
  }

  function computeHelperSlot(input) {
    const measured = input.rectWidth > 0 && input.rectHeight > 0;
    const measuredSize = measured ? Math.max(input.rectWidth, input.rectHeight) : 0;
    const declaredSize = Number.parseFloat(input.declaredSize);
    const fallbackSize = Number.isFinite(input.previousSize) ? input.previousSize : 40;
    const size = measuredSize || (Number.isFinite(declaredSize) ? declaredSize : fallbackSize);
    const top = measured ? input.rectTop : Number.parseFloat(input.inlineTop);
    const right = measured
      ? input.viewportWidth - input.rectRight
      : Number.parseFloat(input.inlineRight);
    return {
      top: Number.isFinite(top) ? Math.round(top) : null,
      right: Number.isFinite(right) ? Math.max(8, Math.round(right)) : null,
      size: Math.max(34, Math.min(52, Math.round(size))),
    };
  }

  function applyHelperMode(helper, active, state, onEnter) {
    if (active) {
      if (!helper) return state;
      if (state.hiddenHelper !== helper) {
        if (typeof onEnter === 'function') onEnter();
        state.hiddenHelper = helper;
        state.previousDisplay = helper.style.display;
      }
      helper.style.display = 'none';
      return state;
    }
    if (state.hiddenHelper) {
      state.hiddenHelper.style.display = state.previousDisplay;
      state.hiddenHelper = null;
      state.previousDisplay = '';
    }
    return state;
  }

  function nextTitleState(state, candidate, now, graceMs) {
    if (candidate) {
      return { action: 'show', detected: candidate, missingTitleSince: 0, retryIn: 0 };
    }
    if (state.detected && state.watchStatus !== 'detail') {
      const missingTitleSince = state.missingTitleSince || now;
      const elapsed = now - missingTitleSince;
      if (elapsed < graceMs) {
        return {
          action: 'hold',
          detected: state.detected,
          missingTitleSince,
          retryIn: Math.min(500, graceMs - elapsed),
        };
      }
    }
    return { action: 'clear', detected: null, missingTitleSince: 0, retryIn: 0 };
  }

  function isElementExposed(node, documentRef, windowRef, isVisible) {
    if (!isVisible(node)) return false;
    if (typeof documentRef.elementsFromPoint !== 'function') return true;
    const rect = node.getBoundingClientRect();
    const points = [
      [rect.left + rect.width / 2, rect.top + rect.height / 2],
      [rect.left + Math.min(8, rect.width / 2), rect.top + Math.min(8, rect.height / 2)],
      [rect.right - Math.min(8, rect.width / 2), rect.bottom - Math.min(8, rect.height / 2)],
    ];
    return points.some(function ([x, y]) {
      if (x < 0 || y < 0 || x >= windowRef.innerWidth || y >= windowRef.innerHeight) {
        return false;
      }
      const top = documentRef.elementsFromPoint(x, y)[0];
      return !top || top === node || node.contains(top);
    });
  }

  scope.StreamingHelperWatchDetection = Object.freeze({
    isWatchScreen,
    watchStatus,
    pathMatches,
    isPrimeWatchScreen,
    computeHelperSlot,
    applyHelperMode,
    nextTitleState,
    isElementExposed,
  });
})(globalThis);
