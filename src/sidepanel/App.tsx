import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { getCollapsedSections, setCollapsedSections } from '@shared/storage';
import { applyTheme } from '@shared/theme';
import { installKeyboard } from './lib/keyboard';
import { favoritesFolderTitle } from './lib/favMenu';
import { useBookmarkChildrenOf, useBookmarkTree, useCurrentWindowId, useFavoritesFolders, useSettings } from './lib/hooks';
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
  const favFolders = useFavoritesFolders();
  const favFolderIds = useMemo(() => (favFolders ?? []).map((f) => f.id), [favFolders]);
  const favItems = useBookmarkChildrenOf(favFolderIds);
  const favIndex = useMemo(() => buildFavoriteIndex(favItems), [favItems]);
  const windowId = useCurrentWindowId();
  const { root } = useBookmarkTree();
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => applyTheme(settings), [settings]);


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
        {!root || !favFolders ? null : searching ? (
          <SearchResults query={query} favoritesFolders={favFolders} favIndex={favIndex} windowId={windowId} />
        ) : (
          <>
            {favFolders.map((folder, i) => (
              <Section
                key={folder.id}
                title={favFolders.length === 1 ? 'お気に入り' : favoritesFolderTitle(folder)}
                collapsed={collapsed.has(`fav:${folder.id}`)}
                onToggle={() => toggleSection(`fav:${folder.id}`)}
                actions={
                  i === 0 ? (
                    <>
                      <FolderPicker root={root} selected={favFolders} />
                      <button class="icon-btn" title="設定" onClick={() => void chrome.runtime.openOptionsPage()}>
                        <Gear />
                      </button>
                    </>
                  ) : undefined
                }
              >
                <Favorites folderId={folder.id} windowId={windowId} />
              </Section>
            ))}
            {settings.showPR && (
              <PRSection windowId={windowId} collapsed={collapsed.has('pr')} onToggle={() => toggleSection('pr')} />
            )}
            <Section title="ブックマーク" collapsed={collapsed.has('bookmarks')} onToggle={() => toggleSection('bookmarks')}>
              <BookmarkTree root={root} favoritesFolders={favFolders} favIndex={favIndex} windowId={windowId} />
            </Section>
            {settings.showTabs && (
              <TabsSection favoritesFolders={favFolders} windowId={windowId} collapsed={collapsed.has('tabs')} onToggle={() => toggleSection('tabs')} />
            )}
          </>
        )}
      </main>
      <ContextMenuHost />
    </div>
  );
}
