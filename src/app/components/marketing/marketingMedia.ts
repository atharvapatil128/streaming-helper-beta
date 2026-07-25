export interface MarketingMediaAsset {
  src: string;
  alt: string;
  width: number;
  height: number;
}

export interface ReplaceableProductMedia {
  heroDashboard: MarketingMediaAsset | null;
  extensionPicker: MarketingMediaAsset | null;
  receivedRecommendations: MarketingMediaAsset | null;
  comfortPicks: MarketingMediaAsset | null;
}

/**
 * Real, sanitized product captures can replace any null entry without changing
 * the landing-page layout. Until then, the page renders its accurate live demo
 * component for that slot.
 */
export const replaceableProductMedia: ReplaceableProductMedia = {
  heroDashboard: null,
  extensionPicker: null,
  receivedRecommendations: null,
  comfortPicks: null,
};
