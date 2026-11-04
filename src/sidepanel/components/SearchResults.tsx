import { useEffect, useState } from 'preact/hooks';
import { hostOf } from '@shared/url';
import { openContextMenu } from '../lib/contextMenu';
import { useChromeEvents, BOOKMARK_EVENTS, type BookmarkNode } from '../lib/hooks';
import { addToFavoritesItems } from '../lib/favMenu';
import { openBookmark, openUrl, wantsBackground, type FavoriteIndex } from '../lib/open';
import { Favicon } from './Favicon';

interface Props {
  query: string;
  favoritesFolders: BookmarkNode[];
  favIndex: FavoriteIndex;
  windowId: number | undefined;
}

export function SearchResults({ query, favoritesFolders, favIndex, windowId }: Props) {
  const [results, setResults] = useState<chrome.bookmarks.BookmarkTreeNode[]>([]);
  const run = () => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    chrome.bookmarks
      .search(q)
      .then((r) => setResults(r.filter((n) => !!n.url).slice(0, 100)))
      .catch(() => setResults([]));
  };
  useEffect(run, [query]);
  useChromeEvents(BOOKMARK_EVENTS, run);

  return (
    <div>
      <div class="results-head">{results.length === 0 ? '見つからない' : `${results.length} 件`}</div>
      {results.map((n) => (
        <div
          key={n.id}
          class="row"
          role="link"
          tabIndex={-1}
          data-nav
          title={`${n.title}\n${n.url}`}
          onClick={(e) => void openBookmark(n.url!, favIndex, { background: wantsBackground(e), windowId })}
          onAuxClick={(e) => {
            if (e.button === 1) void openUrl(n.url!, { background: true, windowId });
          }}
          onContextMenu={(e) =>
            openContextMenu(e, [
              { label: '開く', onSelect: () => openBookmark(n.url!, favIndex, { windowId }) },
              { label: 'バックグラウンドで開く', onSelect: () => openUrl(n.url!, { background: true, windowId }) },
              { label: '現在のタブで開く', onSelect: () => openUrl(n.url!, { currentTab: true, windowId }) },
              ...addToFavoritesItems(favoritesFolders, { title: n.title, url: n.url! }),
              { separator: true },
              { label: 'URL をコピー', onSelect: () => navigator.clipboard.writeText(n.url!) },
            ])
          }
        >
          <Favicon url={n.url} />
          <span class="title">{n.title || n.url}</span>
          <span class="sub">{hostOf(n.url)}</span>
        </div>
      ))}
    </div>
  );
}
