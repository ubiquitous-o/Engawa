import { useEffect, useRef, useState } from 'preact/hooks';

/** 流れる速さ（px/秒）と、止まっている時間（ms）。StaaaaandBy のマーキーに合わせている */
const SPEED = 30;
const PAUSE_MS = 2000;

/**
 * 1 行の文字。枠に収まらないときだけ、左へ流れて一周する。
 * 2 秒止まる → 左へ流れる → 少し間を空けて同じ文字が後ろから続く → 元の位置でまた 2 秒止まる。
 * 収まっているときは何も動かさない。
 */
export function Marquee({ text, class: cls }: { text: string; class?: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(false);

  // はみ出しているかを測る。枠の幅や文字が変わったら測り直す
  useEffect(() => {
    const box = boxRef.current;
    const first = firstRef.current;
    if (!box || !first) return;
    const measure = () => setOverflow(first.offsetWidth > box.clientWidth + 0.5);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, [text]);

  useEffect(() => {
    const box = boxRef.current;
    const track = trackRef.current;
    const first = firstRef.current;
    if (!overflow || !box || !track || !first) return;
    // 2 つ目の文字までの間隔は枠の幅の 1/3。1 つ目の幅 + 間隔だけ動かすと、2 つ目が元の位置に来て継ぎ目が見えない
    const gap = box.clientWidth / 3;
    track.style.columnGap = `${gap}px`;
    const distance = first.offsetWidth + gap;
    const travel = (distance / SPEED) * 1000;
    const total = PAUSE_MS + travel;
    const anim = track.animate(
      [
        { transform: 'translateX(0)', offset: 0 },
        { transform: 'translateX(0)', offset: PAUSE_MS / total },
        { transform: `translateX(${-distance}px)`, offset: 1 },
      ],
      { duration: total, iterations: Infinity, easing: 'linear' },
    );
    return () => anim.cancel();
  }, [overflow, text]);

  return (
    <div ref={boxRef} class={`marquee ${overflow ? 'scrolling' : ''} ${cls ?? ''}`}>
      <div ref={trackRef} class="marquee-track">
        <span ref={firstRef}>{text}</span>
        {overflow && <span aria-hidden="true">{text}</span>}
      </div>
    </div>
  );
}
