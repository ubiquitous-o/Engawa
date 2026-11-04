import type { MenuItem } from './contextMenu';
import type { BookmarkNode } from './hooks';
import { addToFavorites } from './open';

/** お気に入りフォルダの表示名。ブックマークバー自体なら「ブックマークバー」。 */
export function favoritesFolderTitle(folder: BookmarkNode): string {
  const isBar = (folder as { folderType?: string }).folderType === 'bookmarks-bar' || folder.id === '1';
  return isBar ? 'Bookmarks bar' : folder.title || '(untitled)';
}

/**
 * 「お気に入りに追加」のメニュー項目。
 * フォルダが 1 つなら 1 項目、複数ならフォルダごとに 1 項目にする。
 */
export function addToFavoritesItems(
  folders: BookmarkNode[],
  item: { title: string; url: string },
  disabled = false,
): MenuItem[] {
  if (folders.length <= 1) {
    const target = folders[0];
    return [{ label: 'Add to favorites', disabled: disabled || !target, onSelect: () => target && addToFavorites(target.id, item) }];
  }
  return folders.map((f) => ({
    label: `Add to "${favoritesFolderTitle(f)}"`,
    disabled,
    onSelect: () => addToFavorites(f.id, item),
  }));
}
