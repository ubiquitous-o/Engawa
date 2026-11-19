import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

/**
 * 開くと中身が上から伸びて出てきて、閉じると縮んで消える入れ物。
 * 高さは grid-template-rows の 0fr ↔ 1fr で動かすので、中身の高さを測らなくてよい。
 * 閉じているあいだは中身を描かない（大きなツリーでも軽い）。閉じる動きのあいだだけ残す。
 * 最初から開いているものは動かさずに出す（パネルを開いた瞬間に全部が動かないように）。
 */
type Phase = 'closed' | 'pre' | 'opening' | 'open' | 'closing';

// 動きが終わった知らせ（transitionend）が来なかったときの保険。CSS の時間より少し長く
const FALLBACK_MS = 450;

export function Collapse({ open, class: cls = '', children }: { open: boolean; class?: string; children: () => ComponentChildren }) {
  const [phase, setPhase] = useState<Phase>(open ? 'open' : 'closed');
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    const now = phaseRef.current;
    if (open) {
      if (now === 'closed') setPhase('pre');
      else if (now === 'closing') setPhase('opening');
    } else if (now !== 'closed' && now !== 'closing') {
      setPhase(now === 'pre' ? 'closed' : 'closing');
    }
  }, [open]);

  useEffect(() => {
    if (phase === 'pre') {
      // 畳んだ形で一度描かせてから開く形にする。そうしないと動かずに一気に出る
      let second = 0;
      const first = requestAnimationFrame(() => {
        second = requestAnimationFrame(() => setPhase((p) => (p === 'pre' ? 'opening' : p)));
      });
      return () => {
        cancelAnimationFrame(first);
        cancelAnimationFrame(second);
      };
    }
    if (phase === 'opening' || phase === 'closing') {
      const t = setTimeout(() => setPhase((p) => (p === 'opening' ? 'open' : p === 'closing' ? 'closed' : p)), FALLBACK_MS);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [phase]);

  if (phase === 'closed') return null;
  const shown = phase === 'opening' || phase === 'open';
  return (
    <div
      class={`collapse ${shown ? 'open' : ''} ${phase === 'open' ? 'settled' : ''} ${cls}`}
      onTransitionEnd={(e) => {
        if (e.target !== e.currentTarget || e.propertyName !== 'grid-template-rows') return;
        setPhase((p) => (p === 'opening' ? 'open' : p === 'closing' ? 'closed' : p));
      }}
    >
      <div class="collapse-inner">{children()}</div>
    </div>
  );
}
