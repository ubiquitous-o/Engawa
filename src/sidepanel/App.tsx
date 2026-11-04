import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { getCollapsedSections, setCollapsedSections } from '@shared/storage';
import { installKeyboard } from './lib/keyboard';
import { useBookmarkChildren, useBookmarkTree, useCurrentWindowId, useFavoritesFolder, useSettings } from './lib/hooks';
import { buildFavoriteIndex } from './lib/open';
import { BookmarkTree } from './components/BookmarkTree';
import { ContextMenuHost } from './components/ContextMenu';
import { Favorites } from './components/Favorites';
import { FolderPicker } from './components/FolderPicker';
import { Gear } from './components/Icons';
import { PRSection } from './components/PRSection';
import { SearchBox } from './components/SearchBox';
import { SearchResults } from './components/SearchResults';
import { Section } from './components/Section';
import { TabsSection } from './components/TabsSection';

export function App() {
  const settings = useSettings();
  const favFolder = useFavoritesFolder();
  const favItems = useBookmarkChildren(favFolder?.id);
  const favIndex = useMemo(() => buildFavoriteIndex(favItems), [favItems]);
  const windowId = useCurrentWindowId();
  const { root } = useBookmarkTree();
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.documentElement.style.setProperty('--accent', settings.accentColor);
    document.documentElement.dataset.density = settings.density;
  }, [settings.accentColor, settings.density]);


  useEffect(() => {
    void getCollapsedSections().then((ids) => setCollapsed(new Set(ids)));
  }, []);

  const toggleSection = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      void setCollapsedSections([...next]);
      return next;
    });
  }, []);

  useEffect(
    () => installKeyboard({ searchInput: () => searchRef.current, clearSearch: () => setQuery('') }),
    [],
  );

  const searching = query.trim().length > 0;

  return (
    <div class="app">
      <SearchBox value={query} onChange={setQuery} inputRef={searchRef} />
      <main class="scroll">
        {!root || !favFolder ? null : searching ? (
          <SearchResults query={query} favoritesFolderId={favFolder.id} favIndex={favIndex} windowId={windowId} />
        ) : (
          <>
            <Section
              title="お気に入り"
              collapsed={collapsed.has('favorites')}
              onToggle={() => toggleSection('favorites')}
              actions={
                <>
                  <FolderPicker root={root} current={favFolder} />
                  <button class="icon-btn" title="設定" onClick={() => void chrome.runtime.openOptionsPage()}>
                    <Gear />
                  </button>
                </>
              }
            >
              <Favorites folderId={favFolder.id} windowId={windowId} />
            </Section>
            {settings.showPR && (
              <PRSection windowId={windowId} collapsed={collapsed.has('pr')} onToggle={() => toggleSection('pr')} />
            )}
            <Section title="ブックマーク" collapsed={collapsed.has('bookmarks')} onToggle={() => toggleSection('bookmarks')}>
              <BookmarkTree root={root} favoritesFolderId={favFolder.id} favIndex={favIndex} windowId={windowId} />
            </Section>
            {settings.showTabs && (
              <TabsSection favoritesFolderId={favFolder.id} windowId={windowId} collapsed={collapsed.has('tabs')} onToggle={() => toggleSection('tabs')} />
            )}
          </>
        )}
      </main>
      <ContextMenuHost />
    </div>
  );
}
