import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_PASSWORD_LENGTH,
  passwordPolicyError,
} from './passwordPolicy.ts';

test('accepts a password that satisfies every requirement', () => {
  assert.equal(passwordPolicyError('StrongPass1!'), null);
});

test('rejects passwords below the minimum length', () => {
  assert.equal(MIN_PASSWORD_LENGTH, 10);
  assert.match(passwordPolicyError('Short1!A') ?? '', /at least 10/);
});

test('requires lowercase, uppercase, number, and symbol characters', () => {
  assert.match(passwordPolicyError('UPPERCASE1!') ?? '', /lowercase/);
  assert.match(passwordPolicyError('lowercase1!') ?? '', /uppercase/);
  assert.match(passwordPolicyError('NoNumbers!!') ?? '', /number/);
  assert.match(passwordPolicyError('NoSymbols12') ?? '', /symbol/);
});

test('does not count whitespace as the required symbol', () => {
  assert.match(passwordPolicyError('Space Pass1') ?? '', /symbol/);
});

test('accepts long passphrases and supported punctuation', () => {
  assert.equal(passwordPolicyError('Correct Horse Battery 7!'), null);
  assert.equal(passwordPolicyError('UnicodeWord9#é'), null);
});
