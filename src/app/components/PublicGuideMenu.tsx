import { ChevronDown } from 'lucide-react';
import '../../styles/public-guide-menu.css';

const GUIDE_LINKS = [
  { path: '/how-it-works', label: 'How Streaming Helper works' },
  { path: '/share-show-recommendations', label: 'Sharing recommendations with friends' },
  { path: '/save-tv-show-recommendations', label: 'Saving recommendations' },
  { path: '/chrome-extension-show-recommendations', label: 'Chrome extension for recommendations' },
  { path: '/supported-streaming-services', label: 'Supported streaming services' },
  { path: '/extension-permissions', label: 'Extension permissions' },
] as const;

export function PublicGuideMenu({ currentPath }: { currentPath?: string }) {
  return (
    <details className="public-guide-menu">
      <summary>
        <span>How it works</span>
        <ChevronDown size={14} aria-hidden />
      </summary>
      <div>
        {GUIDE_LINKS.map(({ path, label }) => (
          <a href={path} key={path} aria-current={currentPath === path ? 'page' : undefined}>
            {label}
          </a>
        ))}
      </div>
    </details>
  );
}