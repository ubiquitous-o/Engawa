import { getFavoritesFolderIdRaw } from './storage';

type Node = chrome.bookmarks.BookmarkTreeNode;

/** ブックマークバーのノードを返す。 */
export async function getBookmarksBar(): Promise<Node> {
  const [root] = await chrome.bookmarks.getTree();
  const children = root?.children ?? [];
  const byType = children.find((n) => (n as { folderType?: string }).folderType === 'bookmarks-bar');
  const byId = children.find((n) => n.id === '1');
  const bar = byType ?? byId ?? children[0];
  if (!bar) throw new Error('ブックマークバーが見つからない');
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
 * お気に入りとして表示するフォルダの ID。
 * 設定されていない、または消えていたらブックマークバー自体を使う。
 */
export async function getFavoritesFolderId(): Promise<string> {
  const stored = await getFavoritesFolderIdRaw();
  if (stored && (await exists(stored))) return stored;
  return (await getBookmarksBar()).id;
}

export async function getChildrenSafe(id: string): Promise<Node[]> {
  try {
    return await chrome.bookmarks.getChildren(id);
  } catch {
    return [];
  }
}
