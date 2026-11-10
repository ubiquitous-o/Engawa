import { send } from '@shared/messages';
import { normalizeUrl, sameUrl } from '@shared/url';
import { leaveViaPip } from './pip';

export interface OpenOptions {
  /** バックグラウンドの新しいタブで開く（中クリック・修飾キー） */
  background?: boolean;
  /** 現在のタブで開く（既定は新しいタブ） */
  currentTab?: boolean;
  /** 同じ URL のタブが既にあればそこへ切り替える */
  reuse?: boolean;
  windowId?: number;
}

export function wantsBackground(e: MouseEvent): boolean {
  return e.button === 1 || e.metaKey || e.ctrlKey || e.shiftKey;
}

/** URL を開く。既定では新しいタブで開く。 */
export async function openUrl(url: string, opts: OpenOptions = {}): Promise<void> {
  // 表示中のタブから離れる開き方なら、Meet の小窓を先に出す
  if (!opts.background && !opts.currentTab) await leaveViaPip(opts.windowId);
  const windowId = opts.windowId ?? (await chrome.windows.getCurrent()).id;
  if (opts.reuse) {
    const tabs = await chrome.tabs.query({ windowId });
    const hit = tabs.find((t) => sameUrl(t.url, url));
    if (hit?.id !== undefined) {
      await chrome.tabs.update(hit.id, { active: true });
      return;
    }
  }
  if (opts.currentTab) {
    const [active] = await chrome.tabs.query({ windowId, active: true });
    if (active?.id !== undefined) {
      await chrome.tabs.update(active.id, { url });
      return;
    }
  }
  await chrome.tabs.create({ url, windowId, active: !opts.background });
}

/** 正規化 URL → お気に入りのブックマーク ID */
export type FavoriteIndex = Map<string, string>;

export function buildFavoriteIndex(items: chrome.bookmarks.BookmarkTreeNode[]): FavoriteIndex {
  const m: FavoriteIndex = new Map();
  for (const n of items) if (n.url) m.set(normalizeUrl(n.url), n.id);
  return m;
}

/**
 * ブックマークを開く。URL がお気に入りにあれば、新しいタブを増やさず
 * そのお気に入りのタブ（あれば切り替え、なければ作る）として開く。
 */
export async function openBookmark(url: string, favorites: FavoriteIndex, opts: OpenOptions = {}): Promise<void> {
  const favId = favorites.get(normalizeUrl(url));
  if (favId && !opts.background && !opts.currentTab) {
    await leaveViaPip(opts.windowId);
    await send({ type: 'fav:open', bookmarkId: favId, windowId: opts.windowId });
    return;
  }
  await openUrl(url, opts);
}

/** タブをお気に入りフォルダに追加する。 */
export async function addToFavorites(
  favoritesFolderId: string,
  item: { title: string; url: string },
  index?: number,
): Promise<chrome.bookmarks.BookmarkTreeNode> {
  const existing = await chrome.bookmarks.getChildren(favoritesFolderId);
  const dup = existing.find((c) => sameUrl(c.url, item.url));
  if (dup) {
    if (index !== undefined) await chrome.bookmarks.move(dup.id, { parentId: favoritesFolderId, index });
    return dup;
  }
  return chrome.bookmarks.create({ parentId: favoritesFolderId, title: item.title || item.url, url: item.url, index });
}
