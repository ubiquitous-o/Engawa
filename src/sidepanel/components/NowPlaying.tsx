import { createPortal } from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  getPlayback,
  isSpotifyConnected,
  onSpotifyChanged,
  SpotifyError,
  spotifyNext,
  spotifyPause,
  spotifyPlay,
  spotifyPrevious,
  type Playback,
} from '@shared/spotify';
import { Marquee } from './Marquee';

const POLL_MS = 2000;

interface Snapshot {
  playback: Playback;
  /** この状態を受け取った時刻（performance.now()）。再生位置の外挿に使う */
  at: number;
}

interface Art {
  url: string;
  image: ImageBitmap;
  /** 明るいジャケットなら文字を黒にする */
  bright: boolean;
}

function progressOf(s: Snapshot, now: number): number {
  const { playback: p } = s;
  if (p.durationMs <= 0) return 0;
  const ms = p.isPlaying ? p.progressMs + (now - s.at) : p.progressMs;
  return Math.min(1, Math.max(0, ms / p.durationMs));
}

async function loadArt(url: string): Promise<Art> {
  const image = await createImageBitmap(await (await fetch(url)).blob());
  // 16x16 に縮めて平均の明るさを見る
  const c = new OffscreenCanvas(16, 16);
  const ctx = c.getContext('2d')!;
  ctx.drawImage(image, 0, 0, 16, 16);
  const d = ctx.getImageData(0, 0, 16, 16).data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += (0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!) / 255;
  return { url, image, bright: sum / 256 > 0.55 };
}

/**
 * スリットスキャン（縦）。正方形のジャケットを幅いっぱいに描き、再生位置にあたる横 1 行を
 * 縦に引き伸ばして、余った高さを埋める。曲が進むと、ジャケットが下から上へ上がってくる。
 * 曲の頭ではジャケットが下にあって帯が上、曲の終わりではジャケットが上で帯が下に来る。
 * （StaaaaandBy の縦画面と同じ描き方）
 */
function drawSlitScan(ctx: CanvasRenderingContext2D, image: ImageBitmap, w: number, h: number, progress: number): void {
  const srcW = image.width;
  const srcH = image.height;
  ctx.clearRect(0, 0, w, h);
  if (srcW <= 0 || srcH <= 0) return;
  if (w > h) {
    // 枠が横長のとき（一覧が長くて空きが低いとき）は横向きにする。
    // ジャケットを高さいっぱいに描き、再生位置の縦 1 列を横に引き伸ばす。
    // 曲が進むと、ジャケットが右から左へ動いてくる
    // （曲の頭ではジャケットが右で帯が左、終わりではジャケットが左で帯が右）
    const artDstW = h;
    const slitDstW = w - artDstW;
    const slitSrcX = progress * (srcW - 1); // 左の列から右の列へ
    const leftDstW = progress * artDstW;
    const rightDstW = w - leftDstW - slitDstW;
    if (leftDstW > 0.5 && slitSrcX > 0.5) ctx.drawImage(image, 0, 0, slitSrcX, srcH, 0, 0, leftDstW, h);
    if (slitDstW > 0.5) ctx.drawImage(image, slitSrcX, 0, 1, srcH, leftDstW, 0, slitDstW, h);
    if (rightDstW > 0.5 && srcW - slitSrcX > 0.5) ctx.drawImage(image, slitSrcX, 0, srcW - slitSrcX, srcH, leftDstW + slitDstW, 0, rightDstW, h);
    return;
  }
  const artDstH = w; // 正方形のジャケットの表示高さ（幅いっぱい）
  const slitDstH = h - artDstH; // 帯で埋める高さ
  const slitSrcY = progress * (srcH - 1); // 引き伸ばす横 1 行の位置。上の行から下の行へ
  const topDstH = progress * artDstH; // 帯より上に出るジャケットの高さ
  const bottomDstH = h - topDstH - slitDstH;
  // 上: src[0..slitSrcY] → dst[0..topDstH]
  if (topDstH > 0.5 && slitSrcY > 0.5) ctx.drawImage(image, 0, 0, srcW, slitSrcY, 0, 0, w, topDstH);
  // 帯: src[slitSrcY..+1] → dst[topDstH..+slitDstH]
  if (slitDstH > 0.5) ctx.drawImage(image, 0, slitSrcY, srcW, 1, 0, topDstH, w, slitDstH);
  // 下: src[slitSrcY..srcH] → dst[topDstH+slitDstH..h]
  if (bottomDstH > 0.5 && srcH - slitSrcY > 0.5) ctx.drawImage(image, 0, slitSrcY, srcW, srcH - slitSrcY, 0, topDstH + slitDstH, w, bottomDstH);
}

/**
 * artHost: ジャケットを描く場所。一覧（.scroll）の末尾に置いた空の枠で、
 * Tabs の一番下から操作ボタンの上までの空きを埋める。
 */
export function NowPlaying({ artHost }: { artHost: HTMLElement | null }) {
  const [connected, setConnected] = useState(false);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [art, setArt] = useState<Art | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const snapRef = useRef<Snapshot | null>(null);
  snapRef.current = snap;

  useEffect(() => {
    const load = () => void isSpotifyConnected().then(setConnected);
    load();
    return onSpotifyChanged(load);
  }, []);

  // 再生状態を定期的に取りに行く。パネルが見えていないあいだは止める
  useEffect(() => {
    if (!connected) {
      setSnap(null);
      return;
    }
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      let wait = POLL_MS;
      if (document.visibilityState === 'visible') {
        try {
          const playback = await getPlayback();
          if (stopped) return;
          setSnap(playback ? { playback, at: performance.now() } : null);
        } catch (e) {
          if (e instanceof SpotifyError && e.kind === 'rate_limited') wait = Math.max(POLL_MS, e.retryAfterS * 1000);
          else if (e instanceof SpotifyError && e.kind === 'auth') wait = 30_000;
          else wait = 5000;
        }
      }
      if (!stopped) timer = setTimeout(() => void tick(), wait);
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [connected]);

  // ジャケットは URL が変わったときだけ読み込む
  const artUrl = snap?.playback.artUrl ?? null;
  useEffect(() => {
    if (!artUrl) {
      setArt(null);
      return;
    }
    let cancelled = false;
    void loadArt(artUrl)
      .then((a) => !cancelled && setArt(a))
      .catch(() => !cancelled && setArt(null));
    return () => {
      cancelled = true;
    };
  }, [artUrl]);

  // 描画。再生中は毎フレーム、止まっているときは状態が変わったときだけ
  const playing = snap?.playback.isPlaying ?? false;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !art) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    const draw = () => {
      const s = snapRef.current;
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(canvas.clientWidth * dpr);
      const h = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.imageSmoothingQuality = 'high';
      drawSlitScan(ctx, art.image, w, h, s ? progressOf(s, performance.now()) : 0);
      if (playing) raf = requestAnimationFrame(draw);
    };
    draw();
    const ro = new ResizeObserver(() => !playing && draw());
    ro.observe(canvas);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [art, playing, snap, artHost]);

  if (!connected || !snap) return null;
  const p = snap.playback;

  // 操作した直後に表示へ反映し、すぐ取り直しは次の定期取得に任せる
  const toggle = async () => {
    const now = performance.now();
    const progressMs = progressOf(snap, now) * p.durationMs;
    setSnap({ playback: { ...p, isPlaying: !p.isPlaying, progressMs }, at: now });
    await (p.isPlaying ? spotifyPause() : spotifyPlay()).catch(() => undefined);
  };
  const skip = (fn: () => Promise<unknown>) => (e: MouseEvent) => {
    e.stopPropagation();
    void fn().catch(() => undefined);
  };

  return (
    <>
      {/* ジャケットは一覧の末尾の枠へ。Tabs の一番下から操作ボタンの上まで */}
      {artHost && art && createPortal(<canvas ref={canvasRef} class={`now-playing-art ${p.isPlaying ? 'playing' : 'paused'}`} aria-hidden="true" />, artHost)}
      <div class="now-playing" title={`${p.title}\n${p.artist}${p.device ? `\n${p.device}` : ''}`}>
        <div class="now-playing-text">
          <Marquee class="now-playing-title" text={p.title} />
          <Marquee class="now-playing-artist" text={p.artist} />
        </div>
        <div class="now-playing-controls">
          <button title="Previous" onClick={skip(spotifyPrevious)}>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3 3h1.6v10H3zM13 3v10L5.6 8z" />
            </svg>
          </button>
          <button class="main" title={p.isPlaying ? 'Pause' : 'Play'} onClick={() => void toggle()}>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              {p.isPlaying ? <path d="M4 3h3v10H4zM9 3h3v10H9z" /> : <path d="M4.5 2.5v11L13.5 8z" />}
            </svg>
          </button>
          <button title="Next" onClick={skip(spotifyNext)}>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M11.4 3H13v10h-1.6zM3 3v10l7.4-5z" />
            </svg>
          </button>
        </div>
      </div>
    </>
  );
}
