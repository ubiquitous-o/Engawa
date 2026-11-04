export type MenuItem =
  | {
      label: string;
      onSelect: () => unknown;
      danger?: boolean;
      /** 設定すると 1 回目のクリックでこのラベルに変わり、2 回目で実行する */
      confirm?: string;
      disabled?: boolean;
    }
  | { separator: true };

export interface MenuState {
  x: number;
  y: number;
  items: MenuItem[];
}

type Listener = (state: MenuState | null) => void;
const listeners = new Set<Listener>();
let state: MenuState | null = null;

export function openContextMenu(e: MouseEvent, items: MenuItem[]): void {
  e.preventDefault();
  e.stopPropagation();
  state = { x: e.clientX, y: e.clientY, items };
  for (const l of listeners) l(state);
}

export function closeContextMenu(): void {
  if (!state) return;
  state = null;
  for (const l of listeners) l(null);
}

export function subscribeContextMenu(l: Listener): () => void {
  listeners.add(l);
  l(state);
  return () => {
    listeners.delete(l);
  };
}
