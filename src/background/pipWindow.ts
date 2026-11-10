/**
 * Meet の小窓（Document Picture-in-Picture）の位置と大きさを覚えて、次に開いたとき同じに戻す。
 *
 * ページの側からは小窓の位置を指定できないが、拡張はウィンドウを動かせる。
 * 小窓は拡張から「常に最前面のウィンドウ」として見えるので、
 *   - 動かされたり大きさを変えられたら storage.local に残す
 *   - 新しく開いたら、覚えている位置と大きさにする
 * とする。ページ側（public/meet-pip.js）も開くときに大きさを頼むが、あちらは中身の大きさで、
 * モニターをまたぐと合わなくなる。ここでウィンドウそのものの大きさに合わせ直す。
 * ブラウザによっては小窓が拡張から見えない・動かせないことがある。そのときは何もしない。
 */
const KEY_POS = 'meetPipPosition';

interface Bounds {
  left: number;
  top: number;
  // 位置だけ覚えていた版の記録には無い
  width?: number;
  height?: number;
}

function isPip(w: chrome.windows.Window): boolean {
  // Chrome では popup、Vivaldi では normal として見える。どちらも「常に最前面」なのは小窓だけ
  return w.alwaysOnTop === true;
}

/** 開いた直後で、まだ置き場所が落ち着いていない小窓。このあいだの位置は覚えない */
const settling = new Set<number>();
const SETTLE_MS = 1000;

export function registerPipWindowListeners(): void {
  chrome.windows.onCreated.addListener((created) => {
    const id = created.id;
    if (id === undefined) return;
    // 開いた直後、ブラウザは小窓を既定の場所に置いて「動いた」と知らせてくる。
    // それを覚えてしまうと前の位置が上書きされるので、落ち着くまでは覚えない。
    // await より前に印を付ける（知らせのほうが先に届いても間に合うように）。
    settling.add(id);
    void (async () => {
      try {
        const w = await chrome.windows.get(id).catch(() => created);
        if (!isPip(w)) return;
        const r = await chrome.storage.local.get(KEY_POS);
        const pos = r[KEY_POS] as Bounds | undefined;
        if (!pos) return;
        const to: chrome.windows.UpdateInfo = { left: pos.left, top: pos.top };
        if (pos.width && pos.height) {
          to.width = pos.width;
          to.height = pos.height;
        }
        // 動かせないブラウザでは何もしない
        const move = () => chrome.windows.update(id, to).catch(() => undefined);
        await move();
        // ブラウザがあとから置き直すことがあるので、落ち着いたころにもう一度
        await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
        await move();
      } finally {
        settling.delete(id);
      }
    })();
  });

  chrome.windows.onRemoved.addListener((id) => settling.delete(id));

  chrome.windows.onBoundsChanged.addListener((w) => {
    if (w.id === undefined || settling.has(w.id)) return;
    if (!isPip(w) || w.left === undefined || w.top === undefined) return;
    void chrome.storage.local.set({ [KEY_POS]: { left: w.left, top: w.top, width: w.width, height: w.height } satisfies Bounds });
  });
}
