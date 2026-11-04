import { useCallback, useEffect, useState } from 'preact/hooks';
import { send } from '@shared/messages';
import type { FavoritesState } from '@shared/types';
import { currentDrag, endDrag, startDrag } from '../lib/dnd';
import { openContextMenu } from '../lib/contextMenu';
import { useBookmarkChildren, useChromeEvents } from '../lib/hooks';
import { addToFavorites } from '../lib/open';
import { Favicon } from './Favicon';

const TAB_EVENTS = [
  chrome.tabs.onActivated,
  chrome.tabs.onUpdated,
  chrome.tabs.onRemoved,
  chrome.tabs.onCreated,
  chrome.tabs.onReplaced,
  chrome.windows.onFocusChanged,
];

interface Props {
  /** お気に入りとして表示するフォルダ */
  folderId: string;
  windowId: number | undefined;
}

export function Favorites({ folderId, windowId }: Props) {
  const items = useBookmarkChildren(folderId).filter((n) => !!n.url);
  const [state, setState] = useState<FavoritesState>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string | null; after: boolean } | null>(null);
  const [gridOver, setGridOver] = useState(false);

  const refreshState = useCallback(() => {
    send({ type: 'fav:state' })
      .then(setState)
      .catch(() => {});
  }, []);
  useEffect(refreshState, [refreshState, items.length, folderId]);
  useChromeEvents(TAB_EVENTS, refreshState, 120);

  const open = async (id: string) => {
    try {
      await send({ type: 'fav:open', bookmarkId: id, windowId });
    } finally {
      refreshState();
    }
  };

  const insertIndexFor = (): number | undefined => {
    if (!drop || drop.id === null) return undefined;
    const idx = items.findIndex((i) => i.id === drop.id);
    if (idx === -1) return undefined;
    return drop.after ? idx + 1 : idx;
  };

  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    const payload = currentDrag();
    const index = insertIndexFor();
    setDrop(null);
    setGridOver(false);
    setDragId(null);
    if (!payload) return;
    if (payload.kind === 'tab') {
      await addToFavorites(folderId, { title: payload.title, url: payload.url }, index);
    } else if (payload.url) {
      if (payload.parentId === folderId) {
        if (index !== undefined && payload.id !== drop?.id) {
          await chrome.bookmarks.move(payload.id, { parentId: folderId, index });
        }
      } else {
        await chrome.bookmarks.move(payload.id, { parentId: folderId, index });
      }
    }
    refreshState();
  };

  const menuFor = (id: string, url: string) => (e: MouseEvent) => {
    const st = state[id];
    openContextMenu(e, [
      { label: '開く', onSelect: () => open(id) },
      { label: '新しいタブで開く', onSelect: () => chrome.tabs.create({ url, windowId }) },
      { separator: true },
      { label: '元のURLに戻す', disabled: !st?.drifted, onSelect: () => send({ type: 'fav:restore', bookmarkId: id }).then(refreshState) },
      { label: 'タブを閉じる', disabled: !st, onSelect: () => send({ type: 'fav:closeTab', bookmarkId: id }).then(refreshState) },
      { separator: true },
      { label: 'URL をコピー', onSelect: () => navigator.clipboard.writeText(url) },
      {
        label: 'お気に入りから外す',
        onSelect: async () => {
          // データは消さず「その他のブックマーク」へ移す
          const [root] = await chrome.bookmarks.getTree();
          const other =
            root?.children?.find((n) => (n as { folderType?: string }).folderType === 'other') ??
            root?.children?.find((n) => n.id === '2');
          if (other) await chrome.bookmarks.move(id, { parentId: other.id });
        },
      },
      { label: '削除', danger: true, confirm: '本当に削除する？', onSelect: () => chrome.bookmarks.remove(id) },
    ]);
  };

  return (
    <div
      class={`fav-grid ${gridOver && drop?.id === null ? 'drop-target' : ''}`}
      onDragOver={(e) => {
        if (!currentDrag()) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = currentDrag()?.kind === 'tab' ? 'copy' : 'move';
        if (e.target === e.currentTarget) setDrop({ id: null, after: true });
        setGridOver(true);
      }}
      onDragLeave={(e) => {
        if (e.target === e.currentTarget) {
          setGridOver(false);
          setDrop(null);
        }
      }}
      onDrop={onDrop}
    >
      {items.map((item) => {
        const st = state[item.id];
        const url = item.url!;
        const cls = [
          'fav-tile',
          st ? 'open' : '',
          st?.active ? 'active' : '',
          st?.drifted ? 'drifted' : '',
          dragId === item.id ? 'dragging' : '',
          drop?.id === item.id ? (drop.after ? 'drop-after' : 'drop-before') : '',
        ].join(' ');
        return (
          <div
            key={item.id}
            class={cls}
            role="button"
            tabIndex={-1}
            data-nav
            title={`${item.title}\n${url}${st?.drifted ? `\n現在: ${st.currentUrl}` : ''}`}
            draggable
            onClick={() => open(item.id)}
            onAuxClick={(e) => {
              if (e.button === 1) void chrome.tabs.create({ url, windowId });
            }}
            onContextMenu={menuFor(item.id, url)}
            onDragStart={(e) => {
              setDragId(item.id);
              startDrag(e, { kind: 'bookmark', id: item.id, parentId: item.parentId!, index: item.index ?? 0, url, title: item.title });
            }}
            onDragEnd={() => {
              setDragId(null);
              setDrop(null);
              setGridOver(false);
              endDrag();
            }}
            onDragOver={(e) => {
              if (!currentDrag()) return;
              e.preventDefault();
              e.stopPropagation();
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const after = e.clientX - rect.left > rect.width / 2;
              setDrop({ id: item.id, after });
              setGridOver(true);
            }}
          >
            <Favicon url={url} size={22} />
          </div>
        );
      })}
      {items.length === 0 && <div class="fav-empty">タブやブックマークをここにドラッグ</div>}
    </div>
  );
}
