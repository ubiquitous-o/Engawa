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

/**
 * サイドパネルの外（＝いま表示しているページの上）で離したときの受け口。
 * ポインタはパネルの外に出ても、押したままならパネルに届き続ける（座標がビューポートの外になる）。
 */
type OutsideDropHandler = (payload: DragPayload, e: PointerEvent) => void;
let outsideDrop: OutsideDropHandler | null = null;

export function setOutsideDropHandler(fn: OutsideDropHandler | null): void {
  outsideDrop = fn;
}

/** ドラッグ中、ポインタがパネルの外にあるあいだ位置を知らせる。中へ戻る・終わると null。 */
type OutsideHoverHandler = (payload: DragPayload, e: PointerEvent | null) => void;
let outsideHover: OutsideHoverHandler | null = null;
let hoveringOutside = false;

export function setOutsideHoverHandler(fn: OutsideHoverHandler | null): void {
  outsideHover = fn;
}

function notifyHover(e: PointerEvent | null): void {
  if (!e && !hoveringOutside) return;
  hoveringOutside = !!e;
  if (current && outsideHover) outsideHover(current, e);
}

function isOutside(e: PointerEvent): boolean {
  return e.clientX < 0 || e.clientY < 0 || e.clientX > window.innerWidth || e.clientY > window.innerHeight;
}

/** ブックマークにしてよい URL か。タブは何でもドラッグできるが、ブックマーク化は http(s) だけ。 */
export function isWebUrl(url: string | undefined): boolean {
  return /^https?:/.test(url ?? '');
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

// ---------------------------------------------------------------------------
// ポインタ操作によるドラッグ
//
// Vivaldi のパネル内では HTML5 の Drag and Drop が完結しない（dragstart は来ても
// drop が届かない、または始まらない）。ブラウザ差をなくすため、ネイティブの
// ドラッグは dragstart で止め、pointer イベントから dragstart / dragover /
// dragleave / drop / dragend を自前で合成して配る。
// コンポーネント側の onDragStart / onDragOver / onDrop はそのまま使える。
// ---------------------------------------------------------------------------

const DRAG_THRESHOLD = 8;

function synth(type: string, src: MouseEvent | { clientX: number; clientY: number }, dt: DataTransfer, related?: Element | null): DragEvent {
  return new DragEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: src.clientX,
    clientY: src.clientY,
    dataTransfer: dt,
    relatedTarget: related ?? null,
  });
}

function makeGhost(source: HTMLElement, x: number, y: number): HTMLElement {
  const rect = source.getBoundingClientRect();
  const ghost = source.cloneNode(true) as HTMLElement;
  ghost.removeAttribute('id');
  ghost.classList.add('drag-ghost');
  Object.assign(ghost.style, {
    position: 'fixed',
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: '0',
    pointerEvents: 'none',
    opacity: '0.75',
    zIndex: '1000',
    transform: `translate(${x - rect.left - rect.width / 2}px, ${y - rect.top - rect.height / 2}px)`,
  } as Partial<CSSStyleDeclaration>);
  ghost.dataset.offsetX = String(rect.left + rect.width / 2);
  ghost.dataset.offsetY = String(rect.top + rect.height / 2);
  document.body.appendChild(ghost);
  return ghost;
}

/**
 * document に組み込む。戻り値で解除。
 */
export function installPointerDrag(root: Document = document): () => void {
  let pressed: { el: HTMLElement; x: number; y: number; pointerId: number } | null = null;
  let active: { el: HTMLElement; dt: DataTransfer; over: Element | null; ghost: HTMLElement } | null = null;
  let lastPt = { x: 0, y: 0 };
  let raf = 0;

  // 一覧の上下端にポインタを寄せたらスクロールする（ネイティブのドラッグにあった動き）
  const autoScroll = () => {
    raf = 0;
    if (!active) return;
    const sc = root.querySelector<HTMLElement>('.scroll');
    if (!sc) return;
    const r = sc.getBoundingClientRect();
    const edge = 28;
    let dy = 0;
    if (lastPt.y < r.top + edge) dy = -Math.ceil((r.top + edge - lastPt.y) / 3);
    else if (lastPt.y > r.bottom - edge) dy = Math.ceil((lastPt.y - (r.bottom - edge)) / 3);
    if (dy === 0) return;
    sc.scrollTop += dy;
    raf = requestAnimationFrame(autoScroll);
  };

  const suppressNextClick = () => {
    const stop = (e: Event) => {
      e.stopPropagation();
      e.preventDefault();
    };
    root.addEventListener('click', stop, { capture: true, once: true });
    setTimeout(() => root.removeEventListener('click', stop, { capture: true }), 0);
  };

  const finish = (e: PointerEvent, drop: boolean) => {
    const a = active;
    active = null;
    pressed = null;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (!a) return;
    a.ghost.remove();
    root.documentElement.classList.remove('drag-outside');
    notifyHover(null);
    try {
      a.el.releasePointerCapture(e.pointerId);
    } catch {
      // 既に外れている
    }
    const payload = current;
    const outside = drop && isOutside(e);
    const target = drop && !outside ? root.elementFromPoint(e.clientX, e.clientY) : null;
    if (outside) {
      if (a.over) a.over.dispatchEvent(synth('dragleave', e, a.dt, null));
      if (payload && outsideDrop) outsideDrop(payload, e);
    } else if (target) {
      // 直前の dragover を受けた要素と違えば、まずそちらへ移す
      if (target !== a.over) {
        if (a.over) a.over.dispatchEvent(synth('dragleave', e, a.dt, target));
        target.dispatchEvent(synth('dragenter', e, a.dt, a.over));
        target.dispatchEvent(synth('dragover', e, a.dt));
      }
      target.dispatchEvent(synth('drop', e, a.dt));
    } else if (a.over) {
      a.over.dispatchEvent(synth('dragleave', e, a.dt, null));
    }
    a.el.dispatchEvent(synth('dragend', e, a.dt));
    suppressNextClick();
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 || e.pointerType !== 'mouse') return;
    const el = (e.target as Element | null)?.closest<HTMLElement>('[draggable="true"]');
    if (!el || el.closest('input, textarea, [contenteditable="true"]')) return;
    pressed = { el, x: e.clientX, y: e.clientY, pointerId: e.pointerId };
  };

  const onPointerMove = (e: PointerEvent) => {
    if (active) {
      e.preventDefault();
      lastPt = { x: e.clientX, y: e.clientY };
      if (!raf) raf = requestAnimationFrame(autoScroll);
      const g = active.ghost;
      g.style.transform = `translate(${e.clientX - Number(g.dataset.offsetX)}px, ${e.clientY - Number(g.dataset.offsetY)}px)`;
      root.documentElement.classList.toggle('drag-outside', isOutside(e));
      notifyHover(isOutside(e) ? e : null);
      const target = root.elementFromPoint(e.clientX, e.clientY);
      if (target !== active.over) {
        if (active.over) active.over.dispatchEvent(synth('dragleave', e, active.dt, target));
        if (target) target.dispatchEvent(synth('dragenter', e, active.dt, active.over));
        active.over = target;
      }
      if (target) target.dispatchEvent(synth('dragover', e, active.dt));
      return;
    }
    if (!pressed || e.pointerId !== pressed.pointerId) return;
    if (Math.hypot(e.clientX - pressed.x, e.clientY - pressed.y) < DRAG_THRESHOLD) return;
    const el = pressed.el;
    pressed = null;
    const dt = new DataTransfer();
    const start = synth('dragstart', e, dt);
    el.dispatchEvent(start);
    if (start.defaultPrevented) return;
    active = { el, dt, over: null, ghost: makeGhost(el, e.clientX, e.clientY) };
    // パネルの外へ出てもポインタイベントを受け続ける
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // 合成イベントなどでキャプチャできない場合は無視
    }
  };
  // 本物（isTrusted）の dragstart はここで止め、コンポーネントにも届けない。
  // ネイティブのドラッグが始まらないので pointer イベントが続き、上の合成が動く。
  const onNativeDragStart = (e: DragEvent) => {
    if (!e.isTrusted) return;
    e.preventDefault();
    e.stopPropagation();
  };

  const onPointerUp = (e: PointerEvent) => {
    if (active) finish(e, true);
    else pressed = null;
  };
  const onPointerCancel = (e: PointerEvent) => {
    if (active) finish(e, false);
    else pressed = null;
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && active) finish(new PointerEvent('pointercancel', { clientX: -1, clientY: -1 }), false);
  };

  root.addEventListener('pointerdown', onPointerDown, true);
  root.addEventListener('pointermove', onPointerMove, true);
  root.addEventListener('pointerup', onPointerUp, true);
  root.addEventListener('pointercancel', onPointerCancel, true);
  root.addEventListener('keydown', onKey, true);
  root.addEventListener('dragstart', onNativeDragStart, true);
  return () => {
    root.removeEventListener('dragstart', onNativeDragStart, true);
    root.removeEventListener('pointerdown', onPointerDown, true);
    root.removeEventListener('pointermove', onPointerMove, true);
    root.removeEventListener('pointerup', onPointerUp, true);
    root.removeEventListener('pointercancel', onPointerCancel, true);
    root.removeEventListener('keydown', onKey, true);
    active?.ghost.remove();
  };
}
