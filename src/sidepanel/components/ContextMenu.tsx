import { useEffect, useState } from 'preact/hooks';
import { closeContextMenu, subscribeContextMenu, type MenuItem, type MenuState } from '../lib/contextMenu';

export function ContextMenuHost() {
  const [state, setState] = useState<MenuState | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);

  useEffect(() => subscribeContextMenu((s) => {
    setState(s);
    setConfirming(null);
  }), []);

  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeContextMenu();
    };
    const onBlur = () => closeContextMenu();
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', onBlur);
    };
  }, [state]);

  if (!state) return null;

  // 画面外にはみ出さないように位置を調整
  const menuW = 200;
  const menuH = 8 + state.items.length * 30;
  const x = Math.min(state.x, window.innerWidth - menuW - 6);
  const y = Math.min(state.y, window.innerHeight - menuH - 6);

  const run = (item: MenuItem, i: number) => {
    if ('separator' in item) return;
    if (item.confirm && confirming !== i) {
      setConfirming(i);
      return;
    }
    closeContextMenu();
    void item.onSelect();
  };

  return (
    <>
      <div class="ctx-backdrop" onMouseDown={closeContextMenu} onContextMenu={(e) => { e.preventDefault(); closeContextMenu(); }} />
      <div class="ctx-menu" style={{ left: `${Math.max(4, x)}px`, top: `${Math.max(4, y)}px` }} role="menu">
        {state.items.map((item, i) =>
          'separator' in item ? (
            <div class="ctx-sep" key={i} />
          ) : (
            <button
              key={i}
              class={`ctx-item ${item.danger ? 'danger' : ''}`}
              disabled={item.disabled}
              role="menuitem"
              onClick={() => run(item, i)}
            >
              {confirming === i && item.confirm ? item.confirm : item.label}
            </button>
          ),
        )}
      </div>
    </>
  );
}
