import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Chrome,
  CircleHelp,
  ExternalLink,
  Heart,
  KeyRound,
  Mail,
  Search,
  ShieldCheck,
  UserRoundPlus,
  X,
} from "lucide-react";
import logo from "../../imports/image-0.png";
import {
  DASHBOARD_PATH,
  MARKETING_PATH,
} from "../../lib/productUrls";
import "../../styles/help.css";

type HelpCategory = "all" | "account" | "extension" | "friends" | "watching";

type HelpArticle = {
  category: Exclude<HelpCategory, "all">;
  question: string;
  answer: string;
};

const CATEGORY_LABELS: Record<HelpCategory, string> = {
  all: "All answers",
  account: "Account and sign-in",
  extension: "Chrome extension",
  friends: "Friends and recommendations",
  watching: "Comfort Picks and titles",
};

const ARTICLES: HelpArticle[] = [
  {
    category: "account",
    question: "Where should I start?",
    answer:
      "Create your account in the dashboard first. Then install the Chrome extension and sign in there with the same username or email and password. Add at least one friend so you can exchange recommendations.",
  },
  {
    category: "extension",
    question: "Why can't I sign in to the extension?",
    answer:
      "Use the same username or email and password you use for the Streaming Helper dashboard. If a temporary connection check fails, your saved session is kept. Confirm you have the latest extension version, refresh the streaming tab, and try again.",
  },
  {
    category: "extension",
    question: "How do I reconnect the extension?",
    answer:
      "Open the extension popup and sign in again if it shows disconnected. After reconnecting, refresh any already-open Netflix, Prime Video, Disney+, Hulu, or Max tabs so the page helper can load the new session.",
  },
  {
    category: "watching",
    question: "Why couldn't Streaming Helper confidently match a title?",
    answer:
      "Streaming pages change frequently and sometimes expose incomplete title information. Confirm you are on a supported title or watch page, wait a moment, and choose Try again. Matching and availability can also vary by platform and region.",
  },
  {
    category: "watching",
    question: "Why did a recommendation open a search page?",
    answer:
      "Streaming Helper does not connect to streaming accounts or start playback automatically. It opens a verified title destination when one is available, otherwise a platform search or TMDB fallback so you can choose the correct regional result.",
  },
  {
    category: "friends",
    question: "How do I add or remove a friend?",
    answer:
      "Open the dashboard and use Friends to search by username or email. Recommendations are shared only after the connection is accepted. You can manage or remove existing connections from the same Friends area.",
  },
  {
    category: "friends",
    question: "Where do recommendations from friends appear?",
    answer:
      "They remain in the Recommendations area of your dashboard. On supported streaming pages, open the regular Streaming Helper icon and choose Friend Recommendations to see titles without returning to the dashboard.",
  },
  {
    category: "watching",
    question: "How does Comfort Pick work?",
    answer:
      "Save familiar movies and shows to your Comfort List in the dashboard. Away from a watch screen, open the regular extension icon and choose Comfort Pick to select from those saved titles.",
  },
  {
    category: "account",
    question: "What data does Streaming Helper collect?",
    answer:
      "Streaming Helper stores the account, friend, recommendation, and Comfort List data needed to provide the product. It does not connect to streaming accounts, read watch history, or automatically play titles. See the Privacy Policy for full details.",
  },
];

const CATEGORY_ICONS = {
  account: KeyRound,
  extension: Chrome,
  friends: UserRoundPlus,
  watching: Heart,
} as const;

function normalize(value: string) {
  return value.toLocaleLowerCase().trim();
}

export function HelpPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<HelpCategory>("all");

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Help and support | Streaming Helper";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  const articles = useMemo(() => {
    const normalizedQuery = normalize(query);
    return ARTICLES.filter((article) => {
      const matchesCategory = category === "all" || article.category === category;
      const matchesQuery =
        !normalizedQuery ||
        normalize(`${article.question} ${article.answer}`).includes(normalizedQuery);
      return matchesCategory && matchesQuery;
    });
  }, [category, query]);

  const selectCategory = (nextCategory: HelpCategory) => {
    setCategory(nextCategory);
    document
      .getElementById("help-answers")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="help-page">
      <header className="help-header">
        <div className="help-shell help-header__inner">
          <a className="help-brand" href={MARKETING_PATH} aria-label="Streaming Helper home">
            <img src={logo} alt="" width="36" height="36" />
            <span>Streaming Helper</span>
          </a>
          <nav aria-label="Help navigation">
            <a href={MARKETING_PATH}>
              <ArrowLeft size={16} aria-hidden />
              Home
            </a>
            <a className="help-header__dashboard" href={DASHBOARD_PATH}>
              Open dashboard
              <ArrowRight size={16} aria-hidden />
            </a>
          </nav>
        </div>
      </header>

      <main>
        <section className="help-hero help-shell">
          <div className="help-hero__copy">
            <p>STREAMING HELPER SUPPORT</p>
            <h1>How can we help?</h1>
            <span>Find a quick answer or send us the details.</span>
          </div>
          <label className="help-search">
            <Search size={20} aria-hidden />
            <span className="sr-only">Search help answers</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search sign-in, extension, recommendations..."
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear search">
                <X size={17} aria-hidden />
              </button>
            )}
          </label>
        </section>

        <section className="help-shell help-layout">
          <div className="help-self-service">
            <div className="help-section-heading">
              <p>QUICK HELP</p>
              <h2>Choose what you're trying to do</h2>
            </div>

            <div className="help-category-rail" aria-label="Help categories">
              {(Object.keys(CATEGORY_ICONS) as Array<Exclude<HelpCategory, "all">>).map(
                (categoryName) => {
                  const Icon = CATEGORY_ICONS[categoryName];
                  return (
                    <button
                      type="button"
                      key={categoryName}
                      aria-pressed={category === categoryName}
                      onClick={() => selectCategory(categoryName)}
                    >
                      <Icon size={19} aria-hidden />
                      <span>{CATEGORY_LABELS[categoryName]}</span>
                      <ArrowRight size={16} aria-hidden />
                    </button>
                  );
                },
              )}
            </div>

            <div className="help-answers" id="help-answers">
              <div className="help-answers__heading">
                <div>
                  <p>{query ? "SEARCH RESULTS" : "POPULAR BETA QUESTIONS"}</p>
                  <h2>{query ? `Answers for "${query}"` : CATEGORY_LABELS[category]}</h2>
                </div>
                {(query || category !== "all") && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      setCategory("all");
                    }}
                  >
                    Show all
                  </button>
                )}
              </div>

              {articles.length > 0 ? (
                <div className="help-accordion">
                  {articles.map((article) => (
                    <details key={article.question}>
                      <summary>
                        <span>{article.question}</span>
                        <i aria-hidden />
                      </summary>
                      <p>{article.answer}</p>
                    </details>
                  ))}
                </div>
              ) : (
                <div className="help-empty" role="status">
                  <CircleHelp size={24} aria-hidden />
                  <h3>No matching answer yet</h3>
                  <p>Try a shorter search or email support with the details.</p>
                  <a href="mailto:help@streaminghelper.net">Contact support</a>
                </div>
              )}
            </div>
          </div>

          <aside className="help-contact">
            <div className="help-contact__status">
              <i aria-hidden />
              EMAIL SUPPORT
            </div>
            <Mail size={26} aria-hidden />
            <h2>Still need a hand?</h2>
            <p>
              Tell us what happened, where it happened, and what you expected.
              During Beta, we usually reply within 24–48 hours.
            </p>
            <a
              className="help-contact__button"
              href="mailto:help@streaminghelper.net?subject=Streaming%20Helper%20support"
            >
              Email help@streaminghelper.net
              <ExternalLink size={16} aria-hidden />
            </a>
            <div className="help-contact__note">
              <ShieldCheck size={18} aria-hidden />
              <p>
                Never send passwords, authentication codes, session tokens, or
                payment information.
              </p>
            </div>
            <a className="help-contact__privacy" href="/privacy">
              Read the Privacy Policy
              <ArrowRight size={14} aria-hidden />
            </a>
          </aside>
        </section>
      </main>
    </div>
  );
}
