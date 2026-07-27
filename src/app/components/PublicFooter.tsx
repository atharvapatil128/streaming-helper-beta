import { ExternalLink } from "lucide-react";
import logo from "../../imports/image-0.png";
import {
  CHROME_EXTENSION_URL,
  DASHBOARD_PATH,
  HELP_PATH,
  MARKETING_PATH,
} from "../../lib/productUrls";
import "../../styles/public-footer.css";

export function PublicFooter() {
  return (
    <footer className="public-footer">
      <div className="public-footer__inner">
        <div className="public-footer__brand">
          <a href={MARKETING_PATH} aria-label="Streaming Helper home">
            <img src={logo} alt="" width="32" height="32" />
            <span>Streaming Helper</span>
          </a>
          <p>Friend-powered recommendations, ready when you are.</p>
        </div>
        <nav aria-label="Footer navigation">
          <a href={MARKETING_PATH}>About</a>
          <a href={HELP_PATH}>Help</a>
          <a href="/privacy">Privacy</a>
          <a href={DASHBOARD_PATH}>Dashboard</a>
          <a href={CHROME_EXTENSION_URL} target="_blank" rel="noopener noreferrer">
            Chrome extension
            <ExternalLink size={13} aria-hidden />
          </a>
        </nav>
      </div>
      <div className="public-footer__legal">
        <span>© 2026 Streaming Helper</span>
        <span>Built to reduce streaming decision fatigue.</span>
      </div>
    </footer>
  );
}
