import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { getCollapsedSections, setCollapsedSections } from '@shared/storage';
import { applyTheme } from '@shared/theme';
import { send } from '@shared/messages';
import { normalizeUrl } from '@shared/url';
import { installPointerDrag, setOutsideDropHandler, setOutsideHoverHandler } from './lib/dnd';
import { NOTICE_EVENT } from './lib/pip';
import { probeVivaldiTiling, splitTabs, verticalSplitPossible, type SplitSide } from './lib/split';
import { installKeyboard } from './lib/keyboard';
import { favoritesFolderTitle } from './lib/favMenu';
import { useBookmarkChildrenOf, useBookmarkRootId, useBookmarkTree, useCurrentWindowId, useFavoritesFolders, useSettings, type BookmarkNode } from './lib/hooks';
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

/**
 * ページの上のどこで離したかから、置く側を決める。
 * 上 1/4 なら上、下 1/4 なら下、そのあいだは左半分か右半分か。
 * 横: パネルが左にあれば clientX はパネル幅より大きく、右にあれば負になる。
 * 縦: パネルはページとほぼ同じ高さなので、パネルの高さをページの高さとみなす。
 */
function dropSide(clientX: number, clientY: number, windowWidth: number): SplitSide {
  if (verticalSplitPossible()) {
    const y = clientY / Math.max(1, window.innerHeight);
    if (y < 0.25) return 'top';
    if (y > 0.75) return 'bottom';
  }
  const pageWidth = Math.max(1, windowWidth - window.innerWidth);
  const intoPage = clientX > window.innerWidth ? clientX - window.innerWidth : clientX < 0 ? pageWidth + clientX : pageWidth;
  return intoPage < pageWidth / 2 ? 'left' : 'right';
}

function findFolder(node: BookmarkNode, id: string): BookmarkNode | null {
  if (node.id === id) return node.url ? null : node;
  for (const c of node.children ?? []) {
    const hit = findFolder(c, id);
    if (hit) return hit;
  }
  return null;
}

export function App() {
  const settings = useSettings();
  const favFolders = useFavoritesFolders();
  const favFolderIds = useMemo(() => (favFolders ?? []).map((f) => f.id), [favFolders]);
  const favItems = useBookmarkChildrenOf(favFolderIds);
  const favIndex = useMemo(() => buildFavoriteIndex(favItems), [favItems]);
  const windowId = useCurrentWindowId();
  const { root } = useBookmarkTree();
  const bookmarkRootId = useBookmarkRootId();
  // ブックマークセクションに並べるフォルダ。設定したフォルダが消えていたらツリー全体に戻る
  const treeRoot = useMemo(() => (root && bookmarkRootId ? findFolder(root, bookmarkRootId) ?? root : root), [root, bookmarkRootId]);
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => applyTheme(settings), [settings]);
  // Vivaldi のパネルなど HTML5 DnD が始まらない環境向けの代替
  useEffect(() => installPointerDrag(), []);

  // タブ・お気に入り・ブックマークをパネルの外（いま見ているページの上）で離すと、表示中のタブと分割表示にする
  const [splitError, setSplitError] = useState<string | null>(null);
  // ページの上にドラッグしているあいだ、どちら側に入るかを見せる
  const [splitHint, setSplitHint] = useState<SplitSide | null>(null);
  const winWidth = useRef(0);
  useEffect(() => {
    if (windowId === undefined) return;
    const measure = () => void chrome.windows.get(windowId).then((w) => (winWidth.current = w.width ?? 0));
    measure();
    // 上下に割れるのは Vivaldi だけ。Chrome では最初から左右の案内だけにする
    void chrome.tabs.query({ active: true, windowId }).then(([t]) => (t?.id !== undefined ? probeVivaldiTiling(t.id) : undefined));
    window.addEventListener('resize', measure);
    setOutsideHoverHandler((payload, e) => {
      if (!e || (payload.kind === 'bookmark' && !payload.url)) return setSplitHint(null);
      setSplitHint(dropSide(e.clientX, e.clientY, winWidth.current));
    });
    return () => {
      window.removeEventListener('resize', measure);
      setOutsideHoverHandler(null);
    };
  }, [windowId]);
  // Meet の小窓が開けなかったときなどの一言も、同じ場所に出す
  useEffect(() => {
    const onNotice = (e: Event) => setSplitError(String((e as CustomEvent).detail));
    window.addEventListener(NOTICE_EVENT, onNotice);
    return () => window.removeEventListener(NOTICE_EVENT, onNotice);
  }, []);
  useEffect(() => {
    if (windowId === undefined) return;
    setOutsideDropHandler((payload, e) => {
      void (async () => {
        try {
          // 先に「いま見ているタブ」を押さえる（お気に入りを開くとアクティブが移るため）
          const [[viewing], win] = await Promise.all([chrome.tabs.query({ active: true, windowId }), chrome.windows.get(windowId)]);
          if (viewing?.id === undefined) return;
          let dragId: number;
          if (payload.kind === 'tab') {
            dragId = payload.tabId;
          } else if (!payload.url) {
            return; // フォルダ
          } else if (favIndex.has(normalizeUrl(payload.url))) {
            // お気に入り（またはお気に入りと同じ URL のブックマーク）は、対応タブがあればそれを、なければ開いて使う
            const favId = favIndex.get(normalizeUrl(payload.url))!;
            dragId = (await send({ type: 'fav:open', bookmarkId: favId, windowId })).tabId;
          } else {
            const created = await chrome.tabs.create({ url: payload.url, windowId, active: false });
            if (created.id === undefined) return;
            dragId = created.id;
          }
          if (dragId < 0 || dragId === viewing.id) return;
          await splitTabs(dragId, viewing.id, dropSide(e.clientX, e.clientY, win.width ?? 0));
          setSplitError(null);
        } catch (err) {
          setSplitError(err instanceof Error ? err.message : 'Could not split these tabs');
        }
      })();
    });
    return () => setOutsideDropHandler(null);
  }, [windowId, favIndex]);


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
        {splitError && (
          <div class="empty-note split-error" role="status" onClick={() => setSplitError(null)}>
            {splitError}
          </div>
        )}
        {!root || !favFolders ? null : searching ? (
          <SearchResults query={query} favoritesFolders={favFolders} favIndex={favIndex} windowId={windowId} />
        ) : (
          <>
            {favFolders.map((folder, i) => (
              <Section
                key={folder.id}
                title={favFolders.length === 1 ? 'Favorites' : favoritesFolderTitle(folder)}
                collapsed={collapsed.has(`fav:${folder.id}`)}
                onToggle={() => toggleSection(`fav:${folder.id}`)}
                actions={
                  i === 0 ? (
                    <>
                      <FolderPicker root={root} selected={favFolders} />
                      <button class="icon-btn" title="Settings" onClick={() => void chrome.runtime.openOptionsPage()}>
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
            <Section title="Bookmarks" collapsed={collapsed.has('bookmarks')} onToggle={() => toggleSection('bookmarks')}>
              <BookmarkTree root={root} treeRoot={treeRoot ?? root} favoritesFolders={favFolders} favIndex={favIndex} windowId={windowId} />
            </Section>
            {settings.showTabs && (
              <TabsSection favoritesFolders={favFolders} windowId={windowId} collapsed={collapsed.has('tabs')} onToggle={() => toggleSection('tabs')} />
            )}
          </>
        )}
      </main>
      {splitHint && (
        <div class="split-hint" role="status">
          <div class="split-hint-card">
            <div class={`split-hint-pic ${splitHint}`}>
              <span />
              <span />
            </div>
            <div class="split-hint-title">Release to split</div>
            <div class="split-hint-sub">{splitHint === 'top' || splitHint === 'bottom' ? `Opens at the ${splitHint}` : `Opens on the ${splitHint}`}</div>
          </div>
        </div>
      )}
      <ContextMenuHost />
    </div>
  );
}
