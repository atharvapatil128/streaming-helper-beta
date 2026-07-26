
  import { createRoot } from "react-dom/client";
  import {
    shouldShowDashboardPreview,
    shouldShowEditorialMotionPreview,
    shouldShowMarketingLanding,
    shouldShowNightConsoleConcept,
  } from "./lib/appRoutes.ts";
  import "./styles/index.css";

  const showNightConsoleConcept = shouldShowNightConsoleConcept(
    window.location.pathname,
  );
  const showEditorialMotionPreview = shouldShowEditorialMotionPreview(
    window.location.pathname,
  );
  const showDashboardPreview = shouldShowDashboardPreview(
    window.location.pathname,
    window.location.hostname,
  );
  const showMarketingLanding = shouldShowMarketingLanding(
    window.location.pathname,
    window.location.search,
  );

  if (
    !showMarketingLanding &&
    !showNightConsoleConcept &&
    !showEditorialMotionPreview &&
    !showDashboardPreview
  ) {
    document.title = 'Streaming Helper';
    if (window.location.pathname === '/app') {
      document
        .querySelector('meta[name="robots"]')
        ?.setAttribute('content', 'noindex, nofollow');
    }
  }

  const root = createRoot(document.getElementById("root")!);

  if (
    showMarketingLanding ||
    showNightConsoleConcept ||
    showEditorialMotionPreview
  ) {
    void import("./app/components/marketing/NightConsoleConceptPage.tsx").then(
      ({ StableMarketingLandingPage }) => {
        root.render(
          <StableMarketingLandingPage
            editorialMotionPreview={
              showMarketingLanding || showEditorialMotionPreview
            }
          />,
        );
      },
    );
  } else if (showDashboardPreview) {
    document.title = 'Dashboard preview | Streaming Helper';
    document
      .querySelector('meta[name="robots"]')
      ?.setAttribute('content', 'noindex, nofollow');
    void import("./app/components/DashboardPreviewPage.tsx").then(
      ({ DashboardPreviewPage }) => {
        root.render(<DashboardPreviewPage />);
      },
    );
  } else {
    void import("./app/App.tsx").then(({ default: App }) => {
      root.render(<App />);
    });
  }
