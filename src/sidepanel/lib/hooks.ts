import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { getFavoritesFolderId } from '@shared/bookmarks';
import { getSettings, onFavoritesFolderChanged, onSettingsChanged } from '@shared/storage';
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

/** お気に入りとして表示するフォルダ。設定変更やフォルダ削除に追従する。 */
export function useFavoritesFolder(): chrome.bookmarks.BookmarkTreeNode | null {
  const [node, setNode] = useState<chrome.bookmarks.BookmarkTreeNode | null>(null);
  const load = useCallback(() => {
    void getFavoritesFolderId()
      .then((id) => chrome.bookmarks.get(id))
      .then(([n]) => setNode(n ?? null))
      .catch(() => setNode(null));
  }, []);
  useEffect(() => {
    load();
    return onFavoritesFolderChanged(load);
  }, [load]);
  useChromeEvents([chrome.bookmarks.onRemoved, chrome.bookmarks.onChanged, chrome.bookmarks.onMoved], load, 300);
  return node;
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

/** 「3分前」のような相対時刻。 */
export function useRelativeTime(at: number | null): string {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  if (!at) return '未同期';
  const diff = Math.max(0, Date.now() - at);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'たった今';
  if (m < 60) return `${m}分前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}時間前`;
  return `${Math.floor(h / 24)}日前`;
}
