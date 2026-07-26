import assert from 'node:assert/strict';
import test from 'node:test';
import type { Recommendation } from '../types';
import {
  groupSentRecommendations,
  sentRecipientSummary,
} from './sentRecommendationGroups.ts';

function recommendation(
  id: string,
  tmdbId: number,
  recipientId: string,
  recipientName: string,
): Recommendation {
  return {
    id,
    tmdbId,
    title: tmdbId === 1 ? 'The Bear' : 'Project Hail Mary',
    type: 'series',
    thumbnail: '',
    year: '2026',
    rating: null,
    duration: null,
    genres: [],
    platforms: [],
    sourceName: recipientName,
    fromUserId: 'sender',
    toUserId: recipientId,
    dismissed: false,
  };
}

test('groups one sent title while retaining every recipient row', () => {
  const rows = [
    recommendation('a', 1, 'ava', 'Ava'),
    recommendation('b', 1, 'jordan', 'Jordan'),
    recommendation('c', 2, 'riley', 'Riley'),
  ];

  const groups = groupSentRecommendations(rows);

  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].recommendations.map((item) => item.id), ['a', 'b']);
  assert.equal(groups[1].primary.id, 'c');
});

test('summarizes one, two, and many recipients', () => {
  const ava = recommendation('a', 1, 'ava', 'Ava');
  const jordan = recommendation('b', 1, 'jordan', 'Jordan');
  const riley = recommendation('c', 1, 'riley', 'Riley');

  assert.equal(sentRecipientSummary([ava]), 'Sent to Ava');
  assert.equal(sentRecipientSummary([ava, jordan]), 'Sent to Ava and Jordan');
  assert.equal(
    sentRecipientSummary([ava, jordan, riley]),
    'Sent to Ava, Jordan +1',
  );
});
