/**
 * Mac の Spotify アプリから、再生中の曲を直接読む。
 *
 * 拡張は Mac のアプリに話しかけられないので、ネイティブメッセージングで小さな橋
 * （public/native-host/engawa-spotify-host.py）を起こし、橋が AppleScript で Spotify に聞く。
 * Spotify のサーバには出ないので、Web API の呼びすぎ制限も、Client ID もサインインも要らない。
 * 橋は利用者が一度だけ入れる（native-host/install.sh）。
 */
import type { Playback } from './spotify';

const HOST = 'com.engawa.spotify';
const TIMEOUT_MS = 8000;

export class SpotifyAppError extends Error {
  constructor(
    public kind: 'not-installed' | 'not-allowed' | 'failed',
    message: string,
  ) {
    super(message);
  }
}

interface Reply {
  n: number;
  ok: boolean;
  error?: string;
  state?: 'playing' | 'paused' | 'stopped' | 'not-running';
  id?: string;
  title?: string;
  artist?: string;
  artUrl?: string;
  durationMs?: number;
  positionS?: number;
  url?: string;
}

interface Waiter {
  resolve: (r: Reply) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

let port: chrome.runtime.Port | null = null;
let seq = 0;
const waiting = new Map<number, Waiter>();

function failAll(e: Error): void {
  for (const w of waiting.values()) {
    clearTimeout(w.timer);
    w.reject(e);
  }
  waiting.clear();
}

function connect(): chrome.runtime.Port {
  if (port) return port;
  if (typeof chrome.runtime.connectNative !== 'function') {
    throw new SpotifyAppError('not-installed', 'Native messaging is not available in this browser');
  }
  const p = chrome.runtime.connectNative(HOST);
  p.onMessage.addListener((msg: Reply) => {
    const w = waiting.get(msg.n);
    if (!w) return;
    waiting.delete(msg.n);
    clearTimeout(w.timer);
    w.resolve(msg);
  });
  p.onDisconnect.addListener(() => {
    // 橋が入っていないと、つないだ直後にここへ来る
    const reason = chrome.runtime.lastError?.message ?? '';
    if (port === p) port = null;
    failAll(
      /not found|forbidden/i.test(reason)
        ? new SpotifyAppError('not-installed', 'Engawa helper is not installed · see Settings → Spotify')
        : new SpotifyAppError('failed', reason || 'Engawa helper stopped'),
    );
  });
  port = p;
  return p;
}

function request(cmd: string): Promise<Reply> {
  return new Promise<Reply>((resolve, reject) => {
    let p: chrome.runtime.Port;
    try {
      p = connect();
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
      return;
    }
    const n = ++seq;
    const timer = setTimeout(() => {
      waiting.delete(n);
      reject(new SpotifyAppError('failed', 'Engawa helper did not answer'));
    }, TIMEOUT_MS);
    waiting.set(n, { resolve, reject, timer });
    try {
      p.postMessage({ n, cmd });
    } catch {
      waiting.delete(n);
      clearTimeout(timer);
      port = null;
      reject(new SpotifyAppError('failed', 'Engawa helper stopped'));
    }
  }).then((r) => {
    if (r.ok) return r;
    const error = r.error ?? 'unknown error';
    // -1743: macOS の「オートメーション」でブラウザが Spotify を操作する許可が無い
    if (/-1743|not authori[sz]ed|許可/i.test(error)) {
      throw new SpotifyAppError('not-allowed', 'Allow the browser to control Spotify · System Settings → Privacy & Security → Automation');
    }
    throw new SpotifyAppError('failed', `Spotify app: ${error}`);
  });
}

/** spotify:track:xxx → https://open.spotify.com/track/xxx */
function webUrl(uri: string | undefined): string | null {
  const m = /^spotify:([a-z]+):([A-Za-z0-9]+)$/.exec(uri ?? '');
  return m ? `https://open.spotify.com/${m[1]}/${m[2]}` : null;
}

/** いま再生中（または一時停止中）のもの。アプリが起動していない・止まっているときは null。 */
export async function getAppPlayback(): Promise<Playback | null> {
  const r = await request('state');
  if (r.state !== 'playing' && r.state !== 'paused') return null;
  return {
    id: r.id ?? r.title ?? '',
    title: r.title ?? '',
    artist: r.artist ?? '',
    artUrl: r.artUrl || null,
    url: webUrl(r.url),
    isPlaying: r.state === 'playing',
    progressMs: (r.positionS ?? 0) * 1000,
    durationMs: r.durationMs ?? 0,
    device: 'Spotify app',
  };
}

export const appPlay = () => request('play');
export const appPause = () => request('pause');
export const appNext = () => request('next');
export const appPrevious = () => request('previous');
