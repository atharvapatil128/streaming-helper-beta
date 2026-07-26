import type { Recommendation } from '../types';

export interface SentRecommendationGroup {
  key: string;
  primary: Recommendation;
  recommendations: Recommendation[];
}

function sentRecommendationGroupKey(recommendation: Recommendation): string {
  return `${recommendation.type}:${recommendation.tmdbId}`;
}

export function groupSentRecommendations(
  recommendations: Recommendation[],
): SentRecommendationGroup[] {
  const groups = new Map<string, SentRecommendationGroup>();

  for (const recommendation of recommendations) {
    const key = sentRecommendationGroupKey(recommendation);
    const existing = groups.get(key);

    if (existing) {
      existing.recommendations.push(recommendation);
      continue;
    }

    groups.set(key, {
      key,
      primary: recommendation,
      recommendations: [recommendation],
    });
  }

  return Array.from(groups.values());
}

export function sentRecipientSummary(
  recommendations: Recommendation[],
): string {
  const recipients = new Map<string, string>();
  for (const recommendation of recommendations) {
    recipients.set(recommendation.toUserId, recommendation.sourceName);
  }
  const names = Array.from(recipients.values());

  if (names.length === 0) return 'No active recipients';
  if (names.length === 1) return `Sent to ${names[0]}`;
  if (names.length === 2) return `Sent to ${names[0]} and ${names[1]}`;
  return `Sent to ${names[0]}, ${names[1]} +${names.length - 2}`;
}
