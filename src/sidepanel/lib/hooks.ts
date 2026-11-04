import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { getFavoritesFolderIds } from '@shared/bookmarks';
import { getBookmarkRootId, getSettings, onBookmarkRootChanged, onFavoritesFolderChanged, onSettingsChanged } from '@shared/storage';
import { DEFAULT_SETTINGS, type DragPayload, type Settings } from '@shared/types';
import { currentDrag, subscribeDrag } from './dnd';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEvent = { addListener(cb: (...args: any[]) => void): void; removeListener(cb: (...args: any[]) => void): void };

/** 複数の chrome イベントをまとめて購読し、短時間の連続発火は 1 回にまとめる。 */
export function useChromeEvents(events: AnyEvent[], handler: () => void, delay = 60): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fn = () => {
      clearTimeout(timer);
      timer = setTimeout(() => handlerRef.current(), delay);
    };
    for (const ev of events) ev.addListener(fn);
    return () => {
      clearTimeout(timer);
      for (const ev of events) ev.removeListener(fn);
    };
    // events は呼び出し側で安定した配列を渡す
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delay]);
}

/** 今ドラッグ中のペイロード（なければ null）。ドロップゾーンの表示に使う。 */
export function useDragPayload(): DragPayload | null {
  const [p, setP] = useState<DragPayload | null>(currentDrag());
  useEffect(() => subscribeDrag(setP), []);
  return p;
}

export function useSettings(): Settings {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  useEffect(() => {
    void getSettings().then(setSettings);
    return onSettingsChanged(setSettings);
  }, []);
  return settings;
}

/** お気に入りとして表示するフォルダ（表示順）。設定変更やフォルダ削除に追従する。読み込み前は null。 */
export function useFavoritesFolders(): chrome.bookmarks.BookmarkTreeNode[] | null {
  const [nodes, setNodes] = useState<chrome.bookmarks.BookmarkTreeNode[] | null>(null);
  const load = useCallback(() => {
    void getFavoritesFolderIds()
      .then((ids) => Promise.all(ids.map((id) => chrome.bookmarks.get(id).then(([n]) => n).catch(() => null))))
      .then((ns) => setNodes(ns.filter((n): n is chrome.bookmarks.BookmarkTreeNode => !!n)))
      .catch(() => setNodes([]));
  }, []);
  useEffect(() => {
    load();
    return onFavoritesFolderChanged(load);
  }, [load]);
  useChromeEvents([chrome.bookmarks.onRemoved, chrome.bookmarks.onChanged, chrome.bookmarks.onMoved], load, 300);
  return nodes;
}

/** ブックマークセクションのルートフォルダ ID（未設定なら null）。設定変更に追従する。 */
export function useBookmarkRootId(): string | null {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    const load = () => void getBookmarkRootId().then(setId);
    load();
    return onBookmarkRootChanged(load);
  }, []);
  return id;
}

export function useCurrentWindowId(): number | undefined {
  const [id, setId] = useState<number | undefined>();
  useEffect(() => {
    void chrome.windows.getCurrent().then((w) => setId(w.id));
  }, []);
  return id;
}

export type BookmarkNode = chrome.bookmarks.BookmarkTreeNode;

export const BOOKMARK_EVENTS = [
  chrome.bookmarks.onCreated,
  chrome.bookmarks.onRemoved,
  chrome.bookmarks.onChanged,
  chrome.bookmarks.onMoved,
  chrome.bookmarks.onChildrenReordered,
];

export function useBookmarkTree(): { root: BookmarkNode | null; reload: () => void } {
  const [root, setRoot] = useState<BookmarkNode | null>(null);
  const reload = useCallback(() => {
    void chrome.bookmarks.getTree().then(([r]) => setRoot(r ?? null));
  }, []);
  useEffect(reload, [reload]);
  useChromeEvents(BOOKMARK_EVENTS, reload);
  return { root, reload };
}

/** 指定フォルダ直下の子を監視する。 */
export function useBookmarkChildren(folderId: string | null | undefined): BookmarkNode[] {
  const [children, setChildren] = useState<BookmarkNode[]>([]);
  const reload = useCallback(() => {
    if (!folderId) {
      setChildren([]);
      return;
    }
    chrome.bookmarks
      .getChildren(folderId)
      .then(setChildren)
      .catch(() => setChildren([]));
  }, [folderId]);
  useEffect(reload, [reload]);
  useChromeEvents(BOOKMARK_EVENTS, reload);
  return children;
}

/** 複数フォルダ直下の子をまとめて監視する（フォルダの順に連結）。 */
export function useBookmarkChildrenOf(folderIds: string[]): BookmarkNode[] {
  const [children, setChildren] = useState<BookmarkNode[]>([]);
  const key = folderIds.join(',');
  const reload = useCallback(() => {
    const ids = key ? key.split(',') : [];
    void Promise.all(ids.map((id) => chrome.bookmarks.getChildren(id).catch(() => [] as BookmarkNode[])))
      .then((lists) => setChildren(lists.flat()));
  }, [key]);
  useEffect(reload, [reload]);
  useChromeEvents(BOOKMARK_EVENTS, reload);
  return children;
}

/** 「3分前」のような相対時刻。 */
export function useRelativeTime(at: number | null): string {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  if (!at) return 'Not synced';
  const diff = Math.max(0, Date.now() - at);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
