import { getFavoritesFolderIdRaw, getManagedFolders, setManagedFolders } from './storage';
import { FOLDER_NAMES, type ManagedFolders } from './types';

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

async function findOrCreateFolder(parentId: string, title: string): Promise<Node> {
  const children = await chrome.bookmarks.getChildren(parentId);
  const found = children.find((c) => !c.url && c.title === title);
  if (found) return found;
  return chrome.bookmarks.create({ parentId, title });
}

let ensuring: Promise<ManagedFolders> | null = null;

/**
 * Engawa/PR/{レビュー依頼,自分のPR} を保証し、ID を保存して返す。
 * バックグラウンドからだけ呼ぶ（同時実行で重複フォルダを作らないため）。
 */
export function ensureManagedFolders(): Promise<ManagedFolders> {
  if (ensuring) return ensuring;
  ensuring = (async () => {
    try {
      const stored = await getManagedFolders();
      if (
        stored &&
        (await exists(stored.sidebar)) &&
        (await exists(stored.pr)) &&
        (await exists(stored.prReview)) &&
        (await exists(stored.prMine))
      ) {
        return stored;
      }
      const bar = await getBookmarksBar();
      const sidebar = await findOrCreateFolder(bar.id, FOLDER_NAMES.sidebar);
      const pr = await findOrCreateFolder(sidebar.id, FOLDER_NAMES.pr);
      const prReview = await findOrCreateFolder(pr.id, FOLDER_NAMES.prReview);
      const prMine = await findOrCreateFolder(pr.id, FOLDER_NAMES.prMine);
      const folders: ManagedFolders = {
        sidebar: sidebar.id,
        pr: pr.id,
        prReview: prReview.id,
        prMine: prMine.id,
      };
      await setManagedFolders(folders);
      return folders;
    } finally {
      ensuring = null;
    }
  })();
  return ensuring;
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
