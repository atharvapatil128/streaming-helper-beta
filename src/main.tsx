
  import { createRoot } from "react-dom/client";
  import type { ReactNode } from "react";
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
  const preloader = document.getElementById("site-preloader");

  function dismissPreloader() {
    if (!preloader || preloader.classList.contains("is-ready")) return;
    preloader.classList.add("is-ready");
    window.setTimeout(() => preloader.remove(), 260);
  }

  function renderApp(node: ReactNode) {
    root.render(node);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(dismissPreloader);
    });
  }

  if (showHelpPage) {
    void import("./app/components/HelpPage.tsx").then(({ HelpPage }) => {
      renderApp(
        <>
          <HelpPage />
          <PublicAnalytics />
        </>,
      );
    });
  } else if (showPrivacyPage) {
    void import("./app/components/PrivacyPage.tsx").then(({ PrivacyPage }) => {
      renderApp(
        <>
          <PrivacyPage />
          <PublicAnalytics />
        </>,
      );
    });
  } else if (showPublicSearchPage) {
    void import("./app/components/PublicSearchPage.tsx").then(({ PublicSearchPage }) => {
      renderApp(
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
        renderApp(
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
      renderApp(
        <>
          <App />
          <PrivateAcquisitionAnalytics />
        </>,
      );
    });
  } else {
    void import("./app/components/NotFoundPage.tsx").then(({ NotFoundPage }) => {
      renderApp(<NotFoundPage />);
    });
  }
