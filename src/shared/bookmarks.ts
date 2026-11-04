import { getFavoritesFolderIdsRaw } from './storage';

type Node = chrome.bookmarks.BookmarkTreeNode;

/** ブックマークバーのノードを返す。 */
export async function getBookmarksBar(): Promise<Node> {
  const [root] = await chrome.bookmarks.getTree();
  const children = root?.children ?? [];
  const byType = children.find((n) => (n as { folderType?: string }).folderType === 'bookmarks-bar');
  const byId = children.find((n) => n.id === '1');
  const bar = byType ?? byId ?? children[0];
  if (!bar) throw new Error('Bookmarks bar not found');
  return bar;
}

async function exists(id: string | undefined): Promise<boolean> {
  if (!id) return false;
  try {
    const [n] = await chrome.bookmarks.get(id);
    return !!n && !n.url;
  } catch {
    return false;
  }
}

/**
 * お気に入りとして表示するフォルダの ID 一覧（表示順）。
 * 設定されていない、またはすべて消えていたらブックマークバー自体だけを返す。
 */
export async function getFavoritesFolderIds(): Promise<string[]> {
  const stored = await getFavoritesFolderIdsRaw();
  const alive: string[] = [];
  for (const id of stored) if (!alive.includes(id) && (await exists(id))) alive.push(id);
  if (alive.length > 0) return alive;
  return [(await getBookmarksBar()).id];
}

/** すべてのお気に入りフォルダ直下にある URL 付きブックマーク。 */
export async function getFavoriteBookmarks(): Promise<Node[]> {
  const out: Node[] = [];
  for (const id of await getFavoritesFolderIds()) {
    for (const n of await getChildrenSafe(id)) if (n.url) out.push(n);
  }
  return out;
}

export async function getChildrenSafe(id: string): Promise<Node[]> {
  try {
    return await chrome.bookmarks.getChildren(id);
  } catch {
    return [];
  }
}
