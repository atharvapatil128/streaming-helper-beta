'use strict';

const COMPANION_APP_URL = 'https://streaminghelper.net/';

document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('.js-open-app').forEach(function (el) {
    el.addEventListener('click', function (event) {
      event.preventDefault();
      window.open(COMPANION_APP_URL, '_blank', 'noopener,noreferrer');
    });
  });

  document.getElementById('signin-form').addEventListener('submit', function (event) {
    event.preventDefault();
    handleSignIn();
  });
  document.getElementById('disconnect-btn').addEventListener('click', handleDisconnect);
  document.getElementById('retry-session-btn').addEventListener('click', loadAuthState);

  chrome.runtime.onMessage.addListener(function (message) {
    if (message?.type === 'AUTH_STATE_CHANGED') renderAuthState(message.state);
  });

  loadAuthState();
});

async function sendMessage(message) {
  return chrome.runtime.sendMessage(message);
}

async function loadAuthState() {
  showView('view-checking');
  try {
    const response = await sendMessage({ type: 'AUTH_GET_STATE' });
    if (!response?.success) {
      showConnectionProblem(response?.error);
      return;
    }
    renderAuthState(response.state);
  } catch (_) {
    showConnectionProblem('OFFLINE');
  }
}

async function handleSignIn() {
  const identifierEl = document.getElementById('identifier');
  const passwordEl = document.getElementById('password');
  const button = document.getElementById('sign-in-btn');
  const identifier = identifierEl.value.trim();
  const password = passwordEl.value;

  clearError();
  if (!identifier || !password) {
    showError('Please enter your username or email and password.');
    return;
  }

  button.disabled = true;
  button.textContent = 'Signing in…';

  try {
    const response = await sendMessage({ type: 'AUTH_SIGN_IN', identifier, password });
    if (!response?.success && [
      'OFFLINE',
      'SERVICE_ERROR',
      'TIMEOUT',
      'BACKEND_NOT_READY',
      'STORAGE_UNAVAILABLE',
    ].includes(response?.error)) {
      showConnectionProblem(response.error);
      return;
    }
    if (!response?.success) throw new Error(response?.error || 'SIGN_IN_FAILED');
    passwordEl.value = '';
    renderAuthState(response.state);
  } catch (error) {
    showError(friendlyError(error?.message));
    button.disabled = false;
    button.textContent = 'Sign in';
  }
}

async function handleDisconnect() {
  const button = document.getElementById('disconnect-btn');
  button.disabled = true;
  button.textContent = 'Disconnecting…';

  try {
    const response = await sendMessage({ type: 'AUTH_SIGN_OUT' });
    if (!response?.success) throw new Error(response?.error || 'SIGN_OUT_FAILED');
    renderAuthState(response.state);
  } catch (_) {
    button.disabled = false;
    button.textContent = 'Disconnect';
    document.getElementById('connected-error').textContent =
      'Could not disconnect. Please try again.';
  }
}

function renderAuthState(state) {
  if (state?.status === 'offline' || state?.status === 'service_error') {
    showConnectionProblem(state.status);
    return;
  }
  if (state?.status !== 'connected') {
    showSignIn();
    return;
  }

  const profile = state.profile || {};
  const rawDisplayName = profile.displayName || profile.display_name || '';
  const rawUsername = profile.username || '';
  const profileComplete = Boolean(rawDisplayName && rawUsername);
  const displayName = profileComplete ? rawDisplayName : 'Finish setting up your profile';
  const username = profileComplete ? `@${String(rawUsername).replace(/^@/, '')}` : '';

  document.getElementById('connected-name').textContent = displayName;
  document.getElementById('connected-status-label').textContent =
    profileComplete ? 'Connected' : 'Profile setup needed';
  const usernameEl = document.getElementById('connected-username');
  usernameEl.textContent = username;
  usernameEl.classList.toggle('hidden', !username);
  document.getElementById('connected-error').textContent = '';

  const button = document.getElementById('disconnect-btn');
  button.disabled = false;
  button.textContent = 'Disconnect';
  showView('view-connected');
}

function showConnectionProblem(reason) {
  const message = document.getElementById('connection-problem-message');
  if (reason === 'BACKEND_NOT_READY') {
    message.textContent =
      'Extension sign-in is not enabled on the server yet. Your saved session has not been removed.';
  } else if (reason === 'STORAGE_UNAVAILABLE') {
    message.textContent =
      'Chrome could not open secure extension storage. Reload the extension, then try again.';
  } else {
    message.textContent =
      'We couldn’t verify your connection. Your saved session has not been removed.';
  }
  showView('view-problem');
}

function showSignIn(message) {
  showView('view-signin');
  document.getElementById('password').value = '';
  const button = document.getElementById('sign-in-btn');
  button.disabled = false;
  button.textContent = 'Sign in';
  clearError();
  if (message) showError(message);
}

function showView(id) {
  document.querySelectorAll('.view').forEach(function (view) {
    view.classList.toggle('hidden', view.id !== id);
  });
}

function clearError() {
  const error = document.getElementById('signin-error');
  error.textContent = '';
  error.classList.remove('visible');
}

function showError(message) {
  const error = document.getElementById('signin-error');
  error.textContent = message;
  error.classList.add('visible');
}

function friendlyError(message) {
  const lower = String(message || '').toLowerCase();
  if (lower.includes('invalid login') || lower.includes('invalid_grant') ||
      lower.includes('invalid credentials') || lower.includes('invalid_credentials') ||
      lower.includes('sign_in_failed')) {
    return 'Incorrect username/email or password.';
  }
  if (lower.includes('rate limit') || lower.includes('rate_limit') || lower.includes('too many')) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  if (lower.includes('network') || lower.includes('failed to fetch')) {
    return 'Connection error. Check your internet and try again.';
  }
  return 'Sign-in failed. Please try again.';
}
