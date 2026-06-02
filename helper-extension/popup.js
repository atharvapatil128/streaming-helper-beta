'use strict';

// ── Config ────────────────────────────────────────────────────────────────────
// SUPABASE_ANON_KEY is the public anon key — safe to ship in the extension.
// It enforces Row Level Security and cannot bypass database policies.
// Never put the service-role key here or anywhere in frontend/extension code.
const SUPABASE_URL      = 'https://htqwzovhfyyaaipoovjp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0cXd6b3ZoZnl5YWFpcG9vdmpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5MjcwNjcsImV4cCI6MjA5NTUwMzA2N30.xutlxo4ZtEWkaE_KxCV8sOH6-bb1TwCShqx0h0lRFwk';

// TODO: update to production URL before shipping.
const COMPANION_APP_URL = 'https://streaming-helper-beta.vercel.app/';

// ── Storage keys ──────────────────────────────────────────────────────────────
// SK.connected is the key that content.js watches; all others are session data.
const SK = {
  connected:    'streamingHelperConnected', // boolean — read by content.js panel
  accessToken:  'sh_access_token',
  refreshToken: 'sh_refresh_token',
  userId:       'sh_user_id',
  userEmail:    'sh_user_email',
};

// ── Initialise ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
  // Wire up "Open companion app" buttons in both views.
  document.querySelectorAll('.js-open-app').forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.preventDefault();
      window.open(COMPANION_APP_URL, '_blank');
    });
  });

  // Sign-in form submission.
  document.getElementById('signin-form').addEventListener('submit', function (e) {
    e.preventDefault();
    handleSignIn();
  });

  // Disconnect button.
  document.getElementById('disconnect-btn').addEventListener('click', handleDisconnect);

  // Read stored session and show the correct view immediately.
  chrome.storage.local.get([SK.connected, SK.userEmail], function (result) {
    if (result[SK.connected] && result[SK.userEmail]) {
      showConnected(result[SK.userEmail]);
    } else {
      showSignIn();
    }
  });
});

// ── Sign in ───────────────────────────────────────────────────────────────────
async function handleSignIn() {
  const emailEl = document.getElementById('email');
  const passEl  = document.getElementById('password');
  const errEl   = document.getElementById('signin-error');
  const btn     = document.getElementById('sign-in-btn');

  const email    = emailEl.value.trim();
  const password = passEl.value;

  errEl.textContent = '';
  errEl.classList.remove('visible');

  if (!email || !password) {
    showError('Please enter your email and password.');
    return;
  }

  btn.disabled    = true;
  btn.textContent = 'Signing in…';

  try {
    const res = await fetch(
      `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
      {
        method:  'POST',
        headers: {
          'apikey':       SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      }
    );

    const data = await res.json();

    if (!res.ok) {
      // Supabase error shapes: { error, error_description } or { msg }
      throw new Error(data.error_description || data.msg || 'Sign-in failed.');
    }

    // Persist session — tokens are stored but never logged to the console.
    await chrome.storage.local.set({
      [SK.connected]:    true,
      [SK.accessToken]:  data.access_token   ?? '',
      [SK.refreshToken]: data.refresh_token  ?? '',
      [SK.userId]:       data.user?.id       ?? '',
      [SK.userEmail]:    data.user?.email    ?? email,
    });

    // The content.js onChanged listener fires here automatically.
    showConnected(data.user?.email ?? email);

  } catch (err) {
    showError(friendlyError(err.message));
    btn.disabled    = false;
    btn.textContent = 'Sign in';
  }
}

// ── Disconnect ────────────────────────────────────────────────────────────────
function handleDisconnect() {
  // Single storage write so content.js receives exactly one onChanged event.
  chrome.storage.local.set({
    [SK.connected]:    false,
    [SK.accessToken]:  '',
    [SK.refreshToken]: '',
    [SK.userId]:       '',
    [SK.userEmail]:    '',
  }, function () {
    showSignIn();
  });
}

// ── View helpers ──────────────────────────────────────────────────────────────
function showSignIn() {
  document.getElementById('view-signin').classList.remove('hidden');
  document.getElementById('view-connected').classList.add('hidden');
  document.getElementById('email').value    = '';
  document.getElementById('password').value = '';
  const errEl = document.getElementById('signin-error');
  errEl.textContent = '';
  errEl.classList.remove('visible');
  const btn = document.getElementById('sign-in-btn');
  btn.disabled    = false;
  btn.textContent = 'Sign in';
}

function showConnected(email) {
  document.getElementById('view-signin').classList.add('hidden');
  document.getElementById('view-connected').classList.remove('hidden');
  document.getElementById('connected-email').textContent = email;
}

function showError(msg) {
  const errEl = document.getElementById('signin-error');
  errEl.textContent = msg;
  errEl.classList.add('visible');
}

// ── Error message mapping ─────────────────────────────────────────────────────
function friendlyError(msg) {
  if (!msg) return 'Sign-in failed. Please try again.';
  const lower = msg.toLowerCase();
  if (lower.includes('invalid login') || lower.includes('invalid_grant') ||
      lower.includes('invalid credentials')) {
    return 'Incorrect email or password.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Please confirm your email address before signing in.';
  }
  if (lower.includes('rate limit') || lower.includes('too many')) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  if (lower.includes('failed to fetch') || lower.includes('networkerror') ||
      lower.includes('network')) {
    return 'Connection error. Check your internet and try again.';
  }
  return msg;
}
