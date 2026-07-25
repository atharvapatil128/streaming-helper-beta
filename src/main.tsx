
  import { createRoot } from "react-dom/client";
  import { MarketingLandingPage } from "./app/components/marketing/MarketingLandingPage.tsx";
  import { shouldShowMarketingLanding } from "./lib/appRoutes.ts";
  import "./styles/index.css";

  const showMarketingLanding = shouldShowMarketingLanding(
    window.location.pathname,
    window.location.search,
  );

  if (!showMarketingLanding) {
    document.title = 'Streaming Helper';
    if (window.location.pathname === '/app') {
      document
        .querySelector('meta[name="robots"]')
        ?.setAttribute('content', 'noindex, nofollow');
    }
  }

  const root = createRoot(document.getElementById("root")!);

  if (showMarketingLanding) {
    root.render(<MarketingLandingPage />);
  } else {
    void import("./app/App.tsx").then(({ default: App }) => {
      root.render(<App />);
    });
  }
