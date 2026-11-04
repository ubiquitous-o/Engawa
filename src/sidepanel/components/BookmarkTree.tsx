import type { JSX } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { getExpandedFolders, setExpandedFolders, setFavoritesFolderId } from '@shared/storage';
import type { ManagedFolders } from '@shared/types';
import { hostOf } from '@shared/url';
import { currentDrag, dropPositionFor, endDrag, startDrag, type DropPosition } from '../lib/dnd';
import { openContextMenu, type MenuItem } from '../lib/contextMenu';
import { useDragPayload, type BookmarkNode } from '../lib/hooks';
import { addToFavorites, openBookmark, openUrl, wantsBackground, type FavoriteIndex } from '../lib/open';
import { Favicon } from './Favicon';
import { Chevron, Star } from './Icons';

interface Props {
  root: BookmarkNode;
  folders: ManagedFolders;
  /** お気に入りとして表示中のフォルダ */
  favoritesFolderId: string;
  favIndex: FavoriteIndex;
  windowId: number | undefined;
}

interface DropState {
  id: string;
  pos: DropPosition;
}

function indexTree(root: BookmarkNode): Map<string, BookmarkNode> {
  const map = new Map<string, BookmarkNode>();
  const walk = (n: BookmarkNode) => {
    map.set(n.id, n);
    n.children?.forEach(walk);
  };
  walk(root);
  return map;
}

function isDescendant(map: Map<string, BookmarkNode>, id: string, ancestorId: string): boolean {
  let cur = map.get(id);
  while (cur?.parentId) {
    if (cur.parentId === ancestorId) return true;
    cur = map.get(cur.parentId);
  }
  return false;
}

/** インライン名前変更 */
function RenameInput({ initial, onCommit, onCancel }: { initial: string; onCommit: (v: string) => void; onCancel: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      class="rename"
      value={initial}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') onCommit((e.target as HTMLInputElement).value);
        if (e.key === 'Escape') onCancel();
      }}
      onBlur={(e) => onCommit((e.target as HTMLInputElement).value)}
    />
  );
}

export function BookmarkTree({ root, folders, favoritesFolderId, favIndex, windowId }: Props) {
  const map = useMemo(() => indexTree(root), [root]);
  const [expanded, setExpanded] = useState<Set<string> | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [drop, setDrop] = useState<DropState | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [zoneOver, setZoneOver] = useState(false);
  const dragPayload = useDragPayload();
  const bar = root.children?.find((n) => (n as { folderType?: string }).folderType === 'bookmarks-bar' || n.id === '1');

  useEffect(() => {
    void getExpandedFolders().then((ids) => {
      if (ids) setExpanded(new Set(ids));
      else {
        // 初回はブックマークバーだけ開く
        const bar = root.children?.find((n) => (n as { folderType?: string }).folderType === 'bookmarks-bar' || n.id === '1');
        setExpanded(new Set(bar ? [bar.id] : []));
      }
    });
  }, [root]);

  const toggle = useCallback(
    (id: string, force?: boolean) => {
      setExpanded((prev) => {
        const next = new Set(prev ?? []);
        const want = force ?? !next.has(id);
        if (want) next.add(id);
        else next.delete(id);
        void setExpandedFolders([...next]);
        return next;
      });
    },
    [],
  );

  const commitRename = async (id: string, title: string) => {
    setRenaming(null);
    const node = map.get(id);
    const t = title.trim();
    if (node && t && t !== node.title) await chrome.bookmarks.update(id, { title: t });
  };

  const handleDrop = async (e: DragEvent, target: BookmarkNode) => {
    e.preventDefault();
    e.stopPropagation();
    const payload = currentDrag();
    const d = drop;
    setDrop(null);
    setDragging(null);
    if (!payload || !d || d.id !== target.id) return;
    if (payload.kind === 'tab') {
      if (d.pos === 'into') await chrome.bookmarks.create({ parentId: target.id, title: payload.title, url: payload.url });
      else {
        const index = (target.index ?? 0) + (d.pos === 'after' ? 1 : 0);
        await chrome.bookmarks.create({ parentId: target.parentId, title: payload.title, url: payload.url, index });
      }
      return;
    }
    if (payload.id === target.id) return;
    if (isDescendant(map, target.id, payload.id)) return; // 自分の中には入れない
    if (d.pos === 'into') {
      await chrome.bookmarks.move(payload.id, { parentId: target.id });
      toggle(target.id, true);
    } else {
      // chrome.bookmarks.move の index は「移動前の並びでこの位置の前に挿入」
      const index = (target.index ?? 0) + (d.pos === 'after' ? 1 : 0);
      await chrome.bookmarks.move(payload.id, { parentId: target.parentId, index });
    }
  };

  const menuFor = (node: BookmarkNode): MenuItem[] => {
    const isFolder = !node.url;
    const isRoot = !node.parentId || node.parentId === '0';
    const items: MenuItem[] = [];
    if (!isFolder) {
      items.push(
        { label: '開く', onSelect: () => openBookmark(node.url!, favIndex, { windowId }) },
        { label: 'バックグラウンドで開く', onSelect: () => openUrl(node.url!, { background: true, windowId }) },
        { label: '現在のタブで開く', onSelect: () => openUrl(node.url!, { currentTab: true, windowId }) },
        { label: 'お気に入りに追加', onSelect: () => addToFavorites(favoritesFolderId, { title: node.title, url: node.url! }) },
        { separator: true },
        { label: 'URL をコピー', onSelect: () => navigator.clipboard.writeText(node.url!) },
      );
    } else {
      const underBar = bar ? node.id === bar.id || isDescendant(map, node.id, bar.id) : false;
      items.push(
        {
          label: node.id === favoritesFolderId ? 'お気に入りとして表示中' : 'お気に入りとして表示',
          disabled: node.id === favoritesFolderId || !underBar || node.id === folders.sidebar || isDescendant(map, node.id, folders.sidebar),
          onSelect: () => setFavoritesFolderId(node.id === bar?.id ? null : node.id),
        },
        { separator: true },
        {
          label: 'すべて開く',
          disabled: !node.children?.some((c) => c.url),
          onSelect: async () => {
            for (const c of node.children ?? []) if (c.url) await chrome.tabs.create({ url: c.url, windowId, active: false });
          },
        },
        {
          label: '新しいフォルダ',
          onSelect: async () => {
            const created = await chrome.bookmarks.create({ parentId: node.id, title: '新しいフォルダ', index: 0 });
            toggle(node.id, true);
            setRenaming(created.id);
          },
        },
        { separator: true },
      );
    }
    if (!isRoot) {
      items.push({ label: '名前を変更', onSelect: () => setRenaming(node.id) });
      items.push({
        label: '削除',
        danger: true,
        confirm: isFolder && node.children?.length ? `フォルダごと ${node.children.length} 件削除する？` : '本当に削除する？',
        onSelect: () => (isFolder ? chrome.bookmarks.removeTree(node.id) : chrome.bookmarks.remove(node.id)),
      });
    }
    return items;
  };

  const renderNode = (node: BookmarkNode, depth: number): JSX.Element | null => {
    if (node.id === folders.sidebar) return null; // 管理フォルダはお気に入り/PR セクションで表示
    const isFolder = !node.url;
    const isOpen = isFolder && (expanded?.has(node.id) ?? false);
    const isRoot = !node.parentId || node.parentId === '0';
    const indent = 6 + depth * 14;
    const dropCls = drop?.id === node.id ? `drop-${drop.pos}` : '';
    const title = node.title || (isFolder ? '(無題のフォルダ)' : hostOf(node.url));

    const onClick = (e: MouseEvent) => {
      if (renaming === node.id) return;
      if (isFolder) toggle(node.id);
      else void openBookmark(node.url!, favIndex, { background: wantsBackground(e), windowId });
    };

    return (
      <div key={node.id}>
        <div
          class={`row ${isOpen ? 'expanded' : ''} ${dragging === node.id ? 'dragging' : ''} ${dropCls}`}
          style={{ paddingLeft: `${indent}px` }}
          role={isFolder ? 'treeitem' : 'link'}
          aria-expanded={isFolder ? isOpen : undefined}
          tabIndex={-1}
          data-nav
          title={isFolder ? title : `${title}\n${node.url}`}
          draggable={!isRoot}
          onClick={onClick}
          onAuxClick={(e) => {
            if (e.button === 1 && node.url) void openUrl(node.url, { background: true, windowId });
          }}
          onDblClick={(e) => {
            if (!isRoot) {
              e.preventDefault();
              setRenaming(node.id);
            }
          }}
          onContextMenu={(e) => openContextMenu(e, menuFor(node))}
          onKeyDown={(e) => {
            if (!isFolder) return;
            if (e.key === 'ArrowRight') {
              e.preventDefault();
              toggle(node.id, true);
            } else if (e.key === 'ArrowLeft') {
              e.preventDefault();
              if (isOpen) toggle(node.id, false);
              else if (node.parentId) document.querySelector<HTMLElement>(`[data-bm-id="${node.parentId}"]`)?.focus();
            }
          }}
          data-bm-id={node.id}
          onDragStart={(e) => {
            if (isRoot) return e.preventDefault();
            setDragging(node.id);
            startDrag(e, { kind: 'bookmark', id: node.id, parentId: node.parentId!, index: node.index ?? 0, url: node.url, title: node.title });
          }}
          onDragEnd={() => {
            setDragging(null);
            setDrop(null);
            endDrag();
          }}
          onDragOver={(e) => {
            const p = currentDrag();
            if (!p) return;
            if (p.kind === 'bookmark' && (p.id === node.id || isDescendant(map, node.id, p.id))) return;
            e.preventDefault();
            e.stopPropagation();
            if (e.dataTransfer) e.dataTransfer.dropEffect = p.kind === 'tab' ? 'copy' : 'move';
            let pos = dropPositionFor(e, e.currentTarget as HTMLElement, isFolder);
            if (isRoot && pos !== 'into') pos = 'into';
            setDrop((prev) => (prev?.id === node.id && prev.pos === pos ? prev : { id: node.id, pos }));
          }}
          onDragLeave={(e) => {
            if (drop?.id === node.id && !(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) setDrop(null);
          }}
          onDrop={(e) => void handleDrop(e, node)}
        >
          {isFolder ? <Chevron /> : <span style="width:12px;flex:none" />}
          <Favicon url={node.url} />
          {renaming === node.id ? (
            <RenameInput initial={node.title} onCommit={(v) => void commitRename(node.id, v)} onCancel={() => setRenaming(null)} />
          ) : (
            <span class="title">{title}</span>
          )}
          {isFolder && node.id === favoritesFolderId && <Star class="star" />}
          {isFolder && !isOpen && <span class="count">{node.children?.length ?? 0}</span>}
        </div>
        {isFolder && isOpen && node.children && (
          <div class="tree-children" style={{ '--indent': `${indent}px` } as Record<string, string>}>
            {node.children.length === 0 ? (
              <div class="empty-note" style={{ paddingLeft: `${indent + 26}px` }}>空</div>
            ) : (
              node.children.map((c) => renderNode(c, depth + 1))
            )}
          </div>
        )}
      </div>
    );
  };

  /** 行の外（空き領域やドロップゾーン）に落としたらブックマークバーの末尾に追加する */
  const dropToBar = async (e: DragEvent) => {
    e.preventDefault();
    setZoneOver(false);
    setDragging(null);
    setDrop(null);
    const payload = currentDrag();
    if (!payload || !bar) return;
    if (payload.kind === 'tab') {
      await chrome.bookmarks.create({ parentId: bar.id, title: payload.title, url: payload.url });
    } else if (payload.parentId !== bar.id) {
      await chrome.bookmarks.move(payload.id, { parentId: bar.id });
    }
  };
  const isZone = (e: DragEvent) => {
    const t = e.target as HTMLElement;
    return t === e.currentTarget || t.classList.contains('drop-zone');
  };

  if (!expanded) return null;
  return (
    <div
      class={`tree ${zoneOver ? 'zone-over' : ''}`}
      onDragOver={(e) => {
        if (!currentDrag() || !isZone(e)) return;
        e.preventDefault();
        setZoneOver(true);
      }}
      onDragLeave={(e) => {
        if (isZone(e)) setZoneOver(false);
      }}
      onDrop={(e) => {
        if (isZone(e)) void dropToBar(e);
      }}
    >
      {(root.children ?? []).map((n) => renderNode(n, 0))}
      {dragPayload && bar && (
        <div class={`drop-zone ${zoneOver ? 'over' : ''}`}>
          {dragPayload.kind === 'tab' ? 'ここに落としてブックマークバーに追加' : 'ここに落としてブックマークバーへ移動'}
        </div>
      )}
    </div>
  );
}
