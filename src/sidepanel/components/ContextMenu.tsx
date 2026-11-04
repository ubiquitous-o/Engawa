import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { closeContextMenu, subscribeContextMenu, type MenuItem, type MenuState } from '../lib/contextMenu';

export function ContextMenuHost() {
  const [state, setState] = useState<MenuState | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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

  // 実際の高さを測ってから位置を決める。項目が多くて画面に収まらないときは
  // 上端に寄せ、残りはメニュー内のスクロールで見せる。
  // 高さの上限は vh ではなく innerHeight から出し、transform（開くアニメーション）の
  // 影響を受けない offsetWidth/offsetHeight で測る。
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el || !state) return;
    const place = () => {
      const margin = 4;
      el.style.maxHeight = `${window.innerHeight - margin * 2}px`;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const x = Math.max(margin, Math.min(state.x, window.innerWidth - w - margin));
      const y = Math.max(margin, Math.min(state.y, window.innerHeight - h - margin));
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.visibility = 'visible';
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [state]);

  if (!state) return null;

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
      <div class="ctx-menu" ref={menuRef} style={{ left: `${state.x}px`, top: `${state.y}px`, visibility: 'hidden' }} role="menu">
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
