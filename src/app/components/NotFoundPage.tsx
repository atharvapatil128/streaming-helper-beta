import { ArrowLeft } from 'lucide-react';
import logo from '../../imports/image-0.png';
import { HELP_PATH, MARKETING_PATH } from '../../lib/productUrls';
import '../../styles/public-search.css';

export function NotFoundPage() {
  return (
    <main className="public-not-found">
      <img src={logo} alt="" width="52" height="52" />
      <p>404 · PAGE NOT FOUND</p>
      <h1>This recommendation went missing.</h1>
      <span>The page may have moved, or the address may be incomplete.</span>
      <div className="public-search-actions">
        <a href={MARKETING_PATH} className="is-primary"><ArrowLeft size={17} aria-hidden /> Back home</a>
        <a href={HELP_PATH}>Visit Help</a>
      </div>
    </main>
  );
}

