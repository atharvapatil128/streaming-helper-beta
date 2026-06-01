'use strict';

/**
 * Streaming Helper — Background Service Worker (Beta 1)
 *
 * Handles messages from the content script that require privileged
 * extension APIs not available in a content-script context.
 *
 * Message types handled:
 *   OPEN_EXTENSION_POPUP  — attempt to open the extension action popup
 *                           programmatically via chrome.action.openPopup().
 *
 * Responds to each message with { success: boolean, reason?: string }.
 */

chrome.runtime.onMessage.addListener(function (message, _sender, sendResponse) {
  if (message.type !== 'OPEN_EXTENSION_POPUP') {
    // Not our message; let other listeners handle it.
    return false;
  }

  // chrome.action.openPopup() was introduced in Chrome 127.
  // Guard defensively so older Chromium builds do not crash.
  if (typeof chrome.action?.openPopup !== 'function') {
    sendResponse({ success: false, reason: 'api_unavailable' });
    return false;
  }

  // openPopup() returns a Promise. We must return `true` from the listener
  // to keep the message channel open while the promise resolves.
  chrome.action.openPopup()
    .then(function () {
      sendResponse({ success: true });
    })
    .catch(function (err) {
      // Common failure reason: "Must be handling a user gesture to show a popup."
      // The fallback toast in the content script will guide the user instead.
      sendResponse({ success: false, reason: err?.message ?? 'unknown' });
    });

  // Return true: tells Chrome to keep the channel alive for the async reply.
  return true;
});
