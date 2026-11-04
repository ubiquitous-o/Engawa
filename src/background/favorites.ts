import { getFavoriteBookmarks } from '@shared/bookmarks';
import { getFavTabMap, setFavTabMap } from '@shared/storage';
import type { FavoritesState } from '@shared/types';
import { normalizeUrl } from '@shared/url';

/**
 * お気に入り（ブックマーク）とタブの対応表。
 * storage.session に置くので Service Worker が止まっても残り、ブラウザ再起動で消える。
 * 再起動後は reconcile() で URL から照合し直す。
 */

async function tabExists(tabId: number): Promise<chrome.tabs.Tab | null> {
  try {
    return await chrome.tabs.get(tabId);
  } catch {
    return null;
  }
}

/** 対応表を検証し、対応のないお気に入りは URL でタブを探して紐付ける。 */
export async function reconcile(): Promise<Record<string, number>> {
  const favorites = await getFavoriteBookmarks();
  const map = await getFavTabMap();
  const next: Record<string, number> = {};
  const usedTabs = new Set<number>();

  // 既存の対応のうち、タブがまだ生きているものは残す
  for (const fav of favorites) {
    const tabId = map[fav.id];
    if (tabId !== undefined && (await tabExists(tabId)) && !usedTabs.has(tabId)) {
      next[fav.id] = tabId;
      usedTabs.add(tabId);
    }
  }

  // 残りは URL で照合
  const pending = favorites.filter((f) => next[f.id] === undefined);
  if (pending.length > 0) {
    const tabs = await chrome.tabs.query({});
    for (const fav of pending) {
      const target = normalizeUrl(fav.url);
      const tab = tabs.find(
        (t) => t.id !== undefined && !usedTabs.has(t.id) && normalizeUrl(t.url ?? t.pendingUrl) === target,
      );
      if (tab?.id !== undefined) {
        next[fav.id] = tab.id;
        usedTabs.add(tab.id);
      }
    }
  }

  await setFavTabMap(next);
  return next;
}

export async function getState(): Promise<FavoritesState> {
  const map = await reconcile();
  const favorites = await getFavoriteBookmarks();
  const byId = new Map(favorites.map((f) => [f.id, f] as const));
  const state: FavoritesState = {};
  for (const [bookmarkId, tabId] of Object.entries(map)) {
    const tab = await tabExists(tabId);
    const fav = byId.get(bookmarkId);
    if (!tab || !fav) continue;
    const currentUrl = tab.url ?? tab.pendingUrl ?? '';
    state[bookmarkId] = {
      tabId,
      windowId: tab.windowId,
      active: tab.active,
      currentUrl,
      drifted: normalizeUrl(currentUrl) !== normalizeUrl(fav.url),
    };
  }
  return state;
}

/** お気に入りをクリック: 対応タブがあれば切り替え、なければ開く。 */
export async function open(bookmarkId: string, preferredWindowId?: number): Promise<number> {
  const [fav] = await chrome.bookmarks.get(bookmarkId);
  if (!fav?.url) throw new Error('お気に入りが見つからない');
  const map = await reconcile();
  const existing = map[bookmarkId];
  if (existing !== undefined) {
    const tab = await tabExists(existing);
    if (tab?.id !== undefined) {
      await chrome.tabs.update(tab.id, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
      return tab.id;
    }
  }
  const created = await chrome.tabs.create({ url: fav.url, active: true, windowId: preferredWindowId });
  if (created.id === undefined) throw new Error('タブを作れなかった');
  map[bookmarkId] = created.id;
  await setFavTabMap(map);
  return created.id;
}

/** 対応タブをブックマークの URL に戻す。 */
export async function restore(bookmarkId: string): Promise<boolean> {
  const [fav] = await chrome.bookmarks.get(bookmarkId);
  if (!fav?.url) return false;
  const map = await reconcile();
  const tabId = map[bookmarkId];
  if (tabId === undefined) return false;
  await chrome.tabs.update(tabId, { url: fav.url, active: true });
  return true;
}

export async function closeTab(bookmarkId: string): Promise<boolean> {
  const map = await reconcile();
  const tabId = map[bookmarkId];
  if (tabId === undefined) return false;
  delete map[bookmarkId];
  await setFavTabMap(map);
  try {
    await chrome.tabs.remove(tabId);
  } catch {
    return false;
  }
  return true;
}

export function registerFavoriteListeners(): void {
  chrome.tabs.onRemoved.addListener(async (tabId) => {
    const map = await getFavTabMap();
    let changed = false;
    for (const [k, v] of Object.entries(map)) {
      if (v === tabId) {
        delete map[k];
        changed = true;
      }
    }
    if (changed) await setFavTabMap(map);
  });
  chrome.tabs.onReplaced.addListener(async (addedTabId, removedTabId) => {
    const map = await getFavTabMap();
    let changed = false;
    for (const [k, v] of Object.entries(map)) {
      if (v === removedTabId) {
        map[k] = addedTabId;
        changed = true;
      }
    }
    if (changed) await setFavTabMap(map);
  });
  chrome.bookmarks.onRemoved.addListener(async (id) => {
    const map = await getFavTabMap();
    if (id in map) {
      delete map[id];
      await setFavTabMap(map);
    }
  });
}
