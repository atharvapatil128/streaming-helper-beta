export const SITE_ORIGIN = "https://streaminghelper.net";
export const SOCIAL_IMAGE_PATH = "/streaming-helper-social.png";

const shared = {
  image: `${SITE_ORIGIN}${SOCIAL_IMAGE_PATH}`,
  imageAlt: "Streaming Helper passes a show recommendation from a watch screen to a saved recommendation card",
};

export const publicPages = {
  "/": {
    path: "/",
    title: "Streaming Helper | Share show recommendations with friends",
    description: "Send show and movie recommendations while you stream, keep trusted picks organized, and find something to watch without losing recommendations in chat.",
    ...shared,
  },
  "/help": {
    path: "/help",
    title: "Help and support | Streaming Helper",
    description: "Get help with your Streaming Helper account, Chrome extension, friend recommendations, Comfort Picks, and title opening behavior.",
    ...shared,
  },
  "/privacy": {
    path: "/privacy",
    title: "Privacy policy | Streaming Helper",
    description: "Learn what Streaming Helper stores, how the Chrome extension works, and what the product does not collect from streaming accounts.",
    ...shared,
  },
  "/how-it-works": {
    path: "/how-it-works",
    eyebrow: "HOW STREAMING HELPER WORKS",
    title: "How Streaming Helper works | Friend-powered watch picks",
    description: "Create an account, add the Chrome extension, connect with a friend, and send recommendations while you watch.",
    heading: "From a good show to your friend's list",
    intro: "Streaming Helper connects a web dashboard with a Chrome desktop extension. Both friends create an account, connect with each other, and can then exchange recommendations without relying on a message thread.",
    sections: [
      {
        heading: "1. Create your free account",
        paragraphs: ["Your dashboard is the home for friends, received and sent recommendations, and Comfort Picks. Streaming Helper is free during beta."],
      },
      {
        heading: "2. Add the Chrome desktop extension",
        paragraphs: ["Install the extension and sign in with the same username or email and password. The helper appears on supported streaming pages; it does not connect to your streaming accounts."],
      },
      {
        heading: "3. Connect and recommend",
        paragraphs: ["Add a friend who also uses Streaming Helper. On a supported watch page, choose the heart, select the friend, and send. Your friend can find the title later in the extension or dashboard."],
      },
    ],
    related: ["/share-show-recommendations", "/supported-streaming-services", "/extension-permissions"],
    ...shared,
  },
  "/extension-permissions": {
    path: "/extension-permissions",
    eyebrow: "EXTENSION PRIVACY",
    title: "Streaming Helper extension permissions explained",
    description: "A plain-language explanation of why the Streaming Helper Chrome extension needs access to supported streaming pages and local extension storage.",
    heading: "Only the access needed to place the helper where you watch",
    intro: "Chrome permissions can sound broader than the behavior they enable. Streaming Helper uses site access to recognize supported streaming pages and display its helper interface. It does not sign into streaming accounts or read watch history.",
    sections: [
      {
        heading: "Supported-site access",
        paragraphs: ["The extension runs on supported Netflix, Prime Video, Disney+, Hulu, and Max pages so it can detect the visible title context and place the helper on the page."],
      },
      {
        heading: "Extension storage",
        paragraphs: ["Chrome extension storage keeps your Streaming Helper session on your device. Disconnecting the extension clears that local session data."],
      },
      {
        heading: "What it does not do",
        bullets: ["No direct connection to streaming-service accounts", "No watch-history collection", "No automatic playback", "No sale of account or recommendation data"],
      },
    ],
    related: ["/privacy", "/supported-streaming-services", "/chrome-extension-show-recommendations"],
    ...shared,
  },
  "/supported-streaming-services": {
    path: "/supported-streaming-services",
    eyebrow: "WHERE IT WORKS",
    title: "Supported streaming services | Streaming Helper",
    description: "See where the Streaming Helper Chrome extension currently works and understand platform, device, and regional limitations.",
    heading: "Built for the streaming pages you already use",
    intro: "The current Chrome desktop beta supports Netflix, Prime Video, Disney+, Hulu, and Max. Page layouts and title availability vary by service and region, so Streaming Helper may open a title page, platform search, or TMDB fallback.",
    sections: [
      {
        heading: "Supported in the current beta",
        bullets: ["Netflix", "Prime Video", "Disney+", "Hulu", "Max / HBO Max"],
      },
      {
        heading: "Chrome desktop is required",
        paragraphs: ["The in-page helper is a Chrome extension and is designed for desktop browsing. The dashboard remains available on the web, including mobile browsers, but the extension does not run in mobile Chrome."],
      },
      {
        heading: "Availability is not guaranteed",
        paragraphs: ["Streaming Helper does not determine what is included in your subscriptions. Provider catalogs, links, and search results can differ by country and account."],
      },
    ],
    related: ["/how-it-works", "/extension-permissions", "/chrome-extension-show-recommendations"],
    ...shared,
  },
  "/share-show-recommendations": {
    path: "/share-show-recommendations",
    eyebrow: "SHARE WHILE YOU WATCH",
    title: "Share show recommendations with friends | Streaming Helper",
    description: "Recommend a show or movie to a friend from a supported streaming page and keep it available for the moment they need a pick.",
    heading: "A better place for \"you should watch this\"",
    intro: "Messages are useful in the moment but poor at holding a watch recommendation for later. Streaming Helper gives each recommendation a durable place in your friend's dashboard and extension.",
    sections: [
      {
        heading: "Send from the title you are watching",
        paragraphs: ["On a supported watch page, the helper changes to a heart. Open it, confirm the detected title, choose a connected friend, and send."],
      },
      {
        heading: "Both friends need Streaming Helper",
        paragraphs: ["The sender and recipient each need an account, and the friend connection must be accepted before recommendations can be exchanged."],
      },
      {
        heading: "The recipient decides when to open it",
        paragraphs: ["The title remains in Recommendations until the recipient dismisses it. Streaming Helper can open a verified destination, platform search, or TMDB fallback but never starts playback automatically."],
      },
    ],
    related: ["/how-it-works", "/save-tv-show-recommendations", "/chrome-extension-show-recommendations"],
    ...shared,
  },
  "/save-tv-show-recommendations": {
    path: "/save-tv-show-recommendations",
    eyebrow: "KEEP THE GOOD ONES",
    title: "Save TV-show recommendations from friends | Streaming Helper",
    description: "Keep TV-show and movie recommendations from friends organized outside group chats so they are ready when you want to watch.",
    heading: "Recommendations that wait until you are ready",
    intro: "Streaming Helper separates a trusted recommendation from the conversation where it was first mentioned. Received titles stay organized by sender, media type, and platform context.",
    sections: [
      {
        heading: "One recommendation inbox",
        paragraphs: ["Use the dashboard to search, filter, open, or dismiss recommendations. Sent recommendations are grouped by title so you can see every recipient without duplicate cards."],
      },
      {
        heading: "Available where you browse",
        paragraphs: ["Open the normal helper icon on a supported streaming page and choose Friend Recommendations to see titles without returning to the dashboard."],
      },
      {
        heading: "Comfort Picks are separate",
        paragraphs: ["Recommendations come from connected friends. Comfort Picks are familiar titles you save for yourself when you do not want a new discovery."],
      },
    ],
    related: ["/share-show-recommendations", "/how-it-works", "/supported-streaming-services"],
    ...shared,
  },
  "/chrome-extension-show-recommendations": {
    path: "/chrome-extension-show-recommendations",
    eyebrow: "CHROME EXTENSION",
    title: "Chrome extension for show recommendations | Streaming Helper",
    description: "Use Streaming Helper on supported streaming pages to send titles to friends, view friend recommendations, and choose a Comfort Pick.",
    heading: "Friend recommendations beside the streaming page",
    intro: "The Streaming Helper extension adds a small, focused interface to Chrome desktop. Its behavior changes with context: a heart on a supported watch screen, and the regular helper menu elsewhere.",
    sections: [
      {
        heading: "The heart sends the current title",
        paragraphs: ["When a supported watch page is detected, the heart opens a friend picker. You always choose the recipient and explicitly send the recommendation."],
      },
      {
        heading: "The helper icon finds picks",
        paragraphs: ["Away from a watch screen, open Friend Recommendations to browse titles people sent you or use Comfort Pick for something familiar."],
      },
      {
        heading: "Designed with clear boundaries",
        paragraphs: ["The extension reads only the page context needed for title matching, stores its Streaming Helper session locally, and does not connect to streaming accounts or collect watch history."],
      },
    ],
    related: ["/extension-permissions", "/supported-streaming-services", "/share-show-recommendations"],
    ...shared,
  },
};

export const publicSearchPaths = Object.keys(publicPages).filter(
  (path) => !["/", "/help", "/privacy"].includes(path),
);

export const indexablePublicPaths = Object.keys(publicPages);

export function getPublicPage(pathname) {
  const normalized = pathname !== "/" ? pathname.replace(/\/$/, "") : "/";
  return publicPages[normalized] ?? null;
}
