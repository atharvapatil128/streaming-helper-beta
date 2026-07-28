
  import { createRoot } from "react-dom/client";
  import {
    shouldShowEditorialMotionPreview,
    shouldShowHelpPage,
    shouldShowMarketingLanding,
    shouldShowNightConsoleConcept,
  } from "./lib/appRoutes.ts";
  import { PublicAnalytics } from "./app/components/PublicAnalytics.tsx";
  import "./styles/index.css";

  const showNightConsoleConcept = shouldShowNightConsoleConcept(
    window.location.pathname,
  );
  const showEditorialMotionPreview = shouldShowEditorialMotionPreview(
    window.location.pathname,
  );
  const showMarketingLanding = shouldShowMarketingLanding(
    window.location.pathname,
    window.location.search,
  );
  const showHelpPage = shouldShowHelpPage(window.location.pathname);

  if (
    !showMarketingLanding &&
    !showHelpPage &&
    !showNightConsoleConcept &&
    !showEditorialMotionPreview
  ) {
    document.title = 'Streaming Helper';
    if (window.location.pathname === '/app') {
      document
        .querySelector('meta[name="robots"]')
        ?.setAttribute('content', 'noindex, nofollow');
    }
  }

  const root = createRoot(document.getElementById("root")!);

  if (showHelpPage) {
    void import("./app/components/HelpPage.tsx").then(({ HelpPage }) => {
      root.render(
        <>
          <HelpPage />
          <PublicAnalytics />
        </>,
      );
    });
  } else if (
    showMarketingLanding ||
    showNightConsoleConcept ||
    showEditorialMotionPreview
  ) {
    void import("./app/components/marketing/NightConsoleConceptPage.tsx").then(
      ({ StableMarketingLandingPage }) => {
        root.render(
          <>
            <StableMarketingLandingPage
              editorialMotionPreview={
                showMarketingLanding || showEditorialMotionPreview
              }
            />
            <PublicAnalytics />
          </>,
        );
      },
    );
  } else {
    void import("./app/App.tsx").then(({ default: App }) => {
      root.render(<App />);
    });
  }
