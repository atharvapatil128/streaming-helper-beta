
  import { createRoot } from "react-dom/client";
  import {
    shouldShowEditorialMotionPreview,
    shouldShowHelpPage,
    shouldShowPrivacyPage,
    shouldShowPublicSearchPage,
    isKnownApplicationRoute,
    isPrivateAppRoute,
    shouldShowMarketingLanding,
    shouldShowNightConsoleConcept,
  } from "./lib/appRoutes.ts";
  import {
    PrivateAcquisitionAnalytics,
    PublicAnalytics,
  } from "./app/components/PublicAnalytics.tsx";
  import { applyNoIndexMetadata, applyPublicMetadata } from "./lib/seo.ts";
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
  const showPrivacyPage = shouldShowPrivacyPage(window.location.pathname);
  const showPublicSearchPage = shouldShowPublicSearchPage(window.location.pathname);
  const privateAppRoute = isPrivateAppRoute(
    window.location.pathname,
    window.location.search,
  );
  const knownRoute = isKnownApplicationRoute(
    window.location.pathname,
    window.location.search,
  );

  if (showMarketingLanding || showHelpPage || showPrivacyPage || showPublicSearchPage) {
    applyPublicMetadata(window.location.pathname);
  } else {
    applyNoIndexMetadata({ follow: !knownRoute });
  }

  if (
    !showMarketingLanding &&
    !showHelpPage &&
    !showPrivacyPage &&
    !showPublicSearchPage &&
    !showNightConsoleConcept &&
    !showEditorialMotionPreview
  ) {
    document.title = 'Streaming Helper';
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
  } else if (showPrivacyPage) {
    void import("./app/components/PrivacyPage.tsx").then(({ PrivacyPage }) => {
      root.render(
        <>
          <PrivacyPage />
          <PublicAnalytics />
        </>,
      );
    });
  } else if (showPublicSearchPage) {
    void import("./app/components/PublicSearchPage.tsx").then(({ PublicSearchPage }) => {
      root.render(
        <>
          <PublicSearchPage pathname={window.location.pathname} />
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
  } else if (privateAppRoute) {
    void import("./app/App.tsx").then(({ default: App }) => {
      root.render(
        <>
          <App />
          <PrivateAcquisitionAnalytics />
        </>,
      );
    });
  } else {
    void import("./app/components/NotFoundPage.tsx").then(({ NotFoundPage }) => {
      root.render(<NotFoundPage />);
    });
  }
