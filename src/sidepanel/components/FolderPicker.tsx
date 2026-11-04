import { setFavoritesFolderIds } from '@shared/storage';
import { openContextMenu, type MenuItem } from '../lib/contextMenu';
import { favoritesFolderTitle } from '../lib/favMenu';
import type { BookmarkNode } from '../lib/hooks';
import { Chevron, Folder } from './Icons';

interface Props {
  root: BookmarkNode;
  /** 表示中のフォルダ（表示順） */
  selected: BookmarkNode[];
}

/**
 * お気に入りとして表示するフォルダを選ぶ。複数選べる。
 * ブックマークバー直下と、その配下のフォルダから選べる。全部外すとブックマークバー直下に戻る。
 */
export function FolderPicker({ root, selected }: Props) {
  const bar = root.children?.find((n) => (n as { folderType?: string }).folderType === 'bookmarks-bar' || n.id === '1');
  const selectedIds = new Set(selected.map((n) => n.id));

  const toggle = (id: string) => {
    const next = selected.map((n) => n.id).filter((x) => x !== id);
    if (!selectedIds.has(id)) next.push(id);
    void setFavoritesFolderIds(next);
  };

  const open = (e: MouseEvent) => {
    if (!bar) return;
    const items: MenuItem[] = [];
    const mark = (id: string) => (selectedIds.has(id) ? '✓ ' : '　 ');
    items.push({ label: `${mark(bar.id)}ブックマークバー（直下）`, onSelect: () => toggle(bar.id) });
    const walk = (n: BookmarkNode, depth: number) => {
      for (const c of n.children ?? []) {
        if (c.url) continue;
        items.push({ label: `${mark(c.id)}${'　'.repeat(depth)}${c.title || '(無題)'}`, onSelect: () => toggle(c.id) });
        walk(c, depth + 1);
      }
    };
    if ((bar.children ?? []).some((c) => !c.url)) items.push({ separator: true });
    walk(bar, 0);
    openContextMenu(e, items);
  };

  const first = selected[0];
  const label = selected.length === 1 && first ? favoritesFolderTitle(first) : `${selected.length} フォルダ`;

  return (
    <button class="pill-btn" title="お気に入りとして表示するフォルダを選ぶ（複数可）" onClick={open}>
      <Folder />
      <span class="title">{label}</span>
      <Chevron />
    </button>
  );
}
