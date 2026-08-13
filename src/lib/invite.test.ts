import assert from 'node:assert/strict';
import test from 'node:test';
import { PENDING_INVITE_KEY, clearPendingInviteToken, invitePathForToken, parseInviteToken, persistPendingInviteToken, readPendingInviteToken } from './invite.ts';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

test('round-trips encoded invitation tokens through a safe path', () => {
  const path = invitePathForToken(' invite/token+value ');
  assert.equal(path, '/invite/invite%2Ftoken%2Bvalue');
  assert.equal(parseInviteToken(path ?? ''), 'invite/token+value');
});

test('persists, reads, and clears only valid pending tokens', () => {
  const storage = memoryStorage();
  assert.equal(persistPendingInviteToken(' token ', storage), true);
  assert.equal(storage.getItem(PENDING_INVITE_KEY), 'token');
  assert.equal(readPendingInviteToken(storage), 'token');
  clearPendingInviteToken(storage);
  assert.equal(readPendingInviteToken(storage), null);
});

test('removes malformed pending token values', () => {
  const storage = memoryStorage();
  storage.setItem(PENDING_INVITE_KEY, 'x'.repeat(513));
  assert.equal(readPendingInviteToken(storage), null);
  assert.equal(storage.getItem(PENDING_INVITE_KEY), null);
});
