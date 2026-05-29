import { useState } from 'react';

// ── Colour palette — consistent with the app's dark theme ──────────────────
const PALETTE = [
  { bg: '#5b5bd6', fg: '#ffffff' }, // indigo   (matches brand accent)
  { bg: '#7c3aed', fg: '#ffffff' }, // violet
  { bg: '#0891b2', fg: '#ffffff' }, // cyan
  { bg: '#059669', fg: '#ffffff' }, // emerald
  { bg: '#d97706', fg: '#ffffff' }, // amber
  { bg: '#dc2626', fg: '#ffffff' }, // red
  { bg: '#db2777', fg: '#ffffff' }, // pink
  { bg: '#7c7ce8', fg: '#ffffff' }, // light indigo
];

function pickColour(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) % PALETTE.length;
  }
  return PALETTE[Math.abs(hash)];
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface FriendAvatarProps {
  name: string;
  avatar?: string;
  className?: string;
}

/**
 * Shows `avatar` as an image when it is a non-empty URL.
 * Falls back to a coloured initials circle derived deterministically from `name`.
 * Pass sizing via `className` (e.g. "w-10 h-10").
 */
export function FriendAvatar({ name, avatar, className = '' }: FriendAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const colour = pickColour(name);
  const initials = getInitials(name);

  const showInitials = !avatar || imgError;

  if (showInitials) {
    return (
      <div
        className={`rounded-full flex items-center justify-center select-none font-semibold text-xs ${className}`}
        style={{ backgroundColor: colour.bg, color: colour.fg }}
        aria-label={name}
      >
        {initials}
      </div>
    );
  }

  return (
    <img
      src={avatar}
      alt={name}
      className={`rounded-full object-cover ${className}`}
      onError={() => setImgError(true)}
    />
  );
}
