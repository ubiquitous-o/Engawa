import type { DragPayload } from '@shared/types';

/**
 * dragover 中は dataTransfer を読めないので、同一ドキュメント内のドラッグ情報をここに持つ。
 */
let current: DragPayload | null = null;
const subs = new Set<(p: DragPayload | null) => void>();

export function subscribeDrag(fn: (p: DragPayload | null) => void): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}

export function startDrag(e: DragEvent, payload: DragPayload): void {
  current = payload;
  for (const s of subs) s(current);
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'copyMove';
    e.dataTransfer.setData('text/plain', payload.url ?? payload.title);
    if (payload.url) e.dataTransfer.setData('text/uri-list', payload.url);
  }
}

export function endDrag(): void {
  current = null;
  for (const s of subs) s(null);
}

export function currentDrag(): DragPayload | null {
  return current;
}

export type DropPosition = 'before' | 'after' | 'into';

/** 行の縦位置から挿入位置を決める。フォルダなら中央は「中へ」。 */
export function dropPositionFor(e: DragEvent, el: HTMLElement, isFolder: boolean): DropPosition {
  const rect = el.getBoundingClientRect();
  const ratio = (e.clientY - rect.top) / Math.max(1, rect.height);
  if (isFolder) {
    if (ratio < 0.25) return 'before';
    if (ratio > 0.75) return 'after';
    return 'into';
  }
  return ratio < 0.5 ? 'before' : 'after';
}
