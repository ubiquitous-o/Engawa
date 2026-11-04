import { setFavoritesFolderId } from '@shared/storage';
import { openContextMenu, type MenuItem } from '../lib/contextMenu';
import type { BookmarkNode } from '../lib/hooks';
import { Chevron, Folder } from './Icons';

interface Props {
  root: BookmarkNode;
  current: BookmarkNode;
}

/** お気に入りとして表示するフォルダを選ぶ。ブックマークバー直下と、その配下のフォルダから選べる。 */
export function FolderPicker({ root, current }: Props) {
  const bar = root.children?.find((n) => (n as { folderType?: string }).folderType === 'bookmarks-bar' || n.id === '1');
  const isBar = current.id === bar?.id;

  const open = (e: MouseEvent) => {
    if (!bar) return;
    const items: MenuItem[] = [];
    const walk = (n: BookmarkNode, depth: number) => {
      for (const c of n.children ?? []) {
        if (c.url) continue;
        const selected = c.id === current.id;
        items.push({
          label: `${'　'.repeat(depth)}${selected ? '✓ ' : ''}${c.title || '(無題)'}`,
          disabled: selected,
          onSelect: () => setFavoritesFolderId(c.id),
        });
        walk(c, depth + 1);
      }
    };
    items.push({
      label: `${isBar ? '✓ ' : ''}ブックマークバー（直下）`,
      disabled: isBar,
      onSelect: () => setFavoritesFolderId(null),
    });
    if ((bar.children ?? []).some((c) => !c.url)) items.push({ separator: true });
    walk(bar, 0);
    openContextMenu(e, items);
  };

  return (
    <button class="pill-btn" title="お気に入りとして表示するフォルダを選ぶ" onClick={open}>
      <Folder />
      <span class="title">{isBar ? 'ブックマークバー' : current.title || '(無題)'}</span>
      <Chevron />
    </button>
  );
}
