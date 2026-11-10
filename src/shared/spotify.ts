/**
 * Spotify Web API。サインインは Authorization Code + PKCE（クライアントシークレット無し）。
 * Client ID は利用者が自分の Spotify アプリのものを設定画面に入れる。
 * トークンと Client ID は端末内（storage.local）だけに置き、同期もログ出力もしない。
 * 送り先は accounts.spotify.com と api.spotify.com だけ。
 */
const ACCOUNTS = 'https://accounts.spotify.com';
const API = 'https://api.spotify.com/v1';
// 再生状態の読み取りと、再生・停止・曲送りの操作
const SCOPES = 'user-read-playback-state user-modify-playback-state';

const KEY_CLIENT_ID = 'spotifyClientId';
const KEY_TOKENS = 'spotifyTokens';
// 429 で断られたとき、次に呼んでよい時刻（ms）。パネルを開き直しても、それまでは呼ばない
const KEY_BLOCKED_UNTIL = 'spotifyBlockedUntil';

interface Tokens {
  accessToken: string;
  refreshToken: string;
  /** アクセストークンの期限（ms, Date.now() 基準） */
  expiresAt: number;
}

export interface Playback {
  /** 曲（またはエピソード）の ID。曲が変わったかの判定に使う */
  id: string;
  title: string;
  artist: string;
  /** ジャケット画像の URL。無ければ null */
  artUrl: string | null;
  /** Spotify で開く URL */
  url: string | null;
  isPlaying: boolean;
  progressMs: number;
  durationMs: number;
  device: string | null;
}

export class SpotifyError extends Error {
  constructor(
    public kind: 'auth' | 'rate_limited' | 'network' | 'api',
    message: string,
    /** 429 のとき、次に呼んでよいまでの秒数 */
    public retryAfterS = 0,
  ) {
    super(message);
  }
}

// ---- 設定の保存 ----

export async function getSpotifyClientId(): Promise<string> {
  const r = await chrome.storage.local.get(KEY_CLIENT_ID);
  const v = r[KEY_CLIENT_ID];
  return typeof v === 'string' ? v : '';
}

export async function setSpotifyClientId(id: string): Promise<void> {
  if (id) await chrome.storage.local.set({ [KEY_CLIENT_ID]: id });
  else await chrome.storage.local.remove(KEY_CLIENT_ID);
  // 止められるのは Client ID ごと。ID を変えたら、前の ID の停止は忘れる
  await chrome.storage.local.remove(KEY_BLOCKED_UNTIL);
}

async function getTokens(): Promise<Tokens | null> {
  const r = await chrome.storage.local.get(KEY_TOKENS);
  const t = r[KEY_TOKENS] as Tokens | undefined;
  return t?.refreshToken ? t : null;
}

export async function isSpotifyConnected(): Promise<boolean> {
  return (await getTokens()) !== null;
}

export async function disconnectSpotify(): Promise<void> {
  await chrome.storage.local.remove(KEY_TOKENS);
}

/** 接続・切断・Client ID の変更を知らせる。 */
export function onSpotifyChanged(cb: () => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && (changes[KEY_TOKENS] || changes[KEY_CLIENT_ID])) cb();
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

/** Spotify のアプリ設定に登録してもらう戻り先 URL。拡張 ID から決まる。 */
export function spotifyRedirectUri(): string {
  return chrome.identity.getRedirectURL('spotify');
}

// ---- サインイン ----

function base64Url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomString(n: number): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(n))).slice(0, n);
}

async function tokenRequest(clientId: string, params: Record<string, string>, keepRefresh?: string): Promise<Tokens> {
  let res: Response;
  try {
    res = await fetch(`${ACCOUNTS}/api/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, ...params }),
    });
  } catch {
    throw new SpotifyError('network', 'Could not reach Spotify');
  }
  if (!res.ok) throw new SpotifyError('auth', `Spotify sign-in failed (HTTP ${res.status})`);
  const body = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
  const refreshToken = body.refresh_token ?? keepRefresh;
  if (!body.access_token || !refreshToken) throw new SpotifyError('auth', 'Spotify sign-in returned no token');
  const tokens: Tokens = {
    accessToken: body.access_token,
    refreshToken,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  };
  await chrome.storage.local.set({ [KEY_TOKENS]: tokens });
  return tokens;
}

/** ブラウザのサインイン画面を出して接続する。設定画面のボタンから呼ぶ。 */
export async function connectSpotify(): Promise<void> {
  const clientId = await getSpotifyClientId();
  if (!clientId) throw new SpotifyError('auth', 'Enter your Spotify Client ID first');
  const redirectUri = spotifyRedirectUri();
  const verifier = randomString(64);
  const challenge = base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  const state = randomString(16);
  const url = `${ACCOUNTS}/authorize?${new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: SCOPES,
    redirect_uri: redirectUri,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
  })}`;
  let back: string | undefined;
  try {
    back = await chrome.identity.launchWebAuthFlow({ url, interactive: true });
  } catch (e) {
    throw new SpotifyError('auth', e instanceof Error ? e.message : 'Sign-in was cancelled');
  }
  if (!back) throw new SpotifyError('auth', 'Sign-in was cancelled');
  const q = new URL(back).searchParams;
  if (q.get('error')) throw new SpotifyError('auth', `Spotify refused: ${q.get('error')}`);
  const code = q.get('code');
  if (!code || q.get('state') !== state) throw new SpotifyError('auth', 'No authorization code in the redirect');
  await tokenRequest(clientId, { grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: verifier });
}

async function accessToken(force = false): Promise<string> {
  const tokens = await getTokens();
  if (!tokens) throw new SpotifyError('auth', 'Not connected to Spotify');
  if (!force && tokens.expiresAt - Date.now() > 60_000) return tokens.accessToken;
  const clientId = await getSpotifyClientId();
  const next = await tokenRequest(clientId, { grant_type: 'refresh_token', refresh_token: tokens.refreshToken }, tokens.refreshToken);
  return next.accessToken;
}

// ---- API ----

async function api(method: string, path: string, retried = false): Promise<Response> {
  // 断られている最中に呼び続けると、停止が延びるおそれがある。時刻が来るまでは呼ばない
  const blocked = (await chrome.storage.local.get(KEY_BLOCKED_UNTIL))[KEY_BLOCKED_UNTIL] as number | undefined;
  if (blocked && blocked > Date.now()) {
    throw new SpotifyError('rate_limited', 'Spotify rate limit', Math.ceil((blocked - Date.now()) / 1000));
  }
  const token = await accessToken();
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, { method, headers: { Authorization: `Bearer ${token}` } });
  } catch {
    throw new SpotifyError('network', 'Could not reach Spotify');
  }
  if (res.status === 401 && !retried) {
    await accessToken(true);
    return api(method, path, true);
  }
  if (res.status === 401) throw new SpotifyError('auth', 'Spotify sign-in expired. Connect again in the settings');
  if (res.status === 429) {
    const retryAfterS = Number(res.headers.get('Retry-After')) || 5;
    await chrome.storage.local.set({ [KEY_BLOCKED_UNTIL]: Date.now() + retryAfterS * 1000 });
    throw new SpotifyError('rate_limited', 'Spotify rate limit', retryAfterS);
  }
  if (!res.ok) throw new SpotifyError('api', `Spotify API error (HTTP ${res.status})`);
  return res;
}

interface ApiImage {
  url: string;
  width?: number;
}
interface ApiItem {
  id?: string;
  uri?: string;
  name?: string;
  duration_ms?: number;
  artists?: { name: string }[];
  album?: { images?: ApiImage[] };
  show?: { name?: string };
  images?: ApiImage[];
  external_urls?: { spotify?: string };
}

/** いま再生中（または一時停止中）のもの。何も無ければ null。どの端末で再生していても取れる。 */
export async function getPlayback(): Promise<Playback | null> {
  const res = await api('GET', '/me/player?additional_types=episode');
  if (res.status === 204) return null;
  const body = (await res.json()) as { is_playing?: boolean; progress_ms?: number; item?: ApiItem | null; device?: { name?: string } };
  const item = body.item;
  if (!item) return null;
  const images = item.album?.images ?? item.images ?? [];
  // 帯は小さいので 300px 前後で足りる。無ければ一番大きいもの
  const art = images.find((i) => (i.width ?? 0) >= 250 && (i.width ?? 0) <= 400) ?? images[0];
  return {
    id: item.id ?? item.uri ?? item.name ?? '',
    title: item.name ?? '',
    artist: item.artists?.map((a) => a.name).join(', ') ?? item.show?.name ?? '',
    artUrl: art?.url ?? null,
    url: item.external_urls?.spotify ?? null,
    isPlaying: !!body.is_playing,
    progressMs: body.progress_ms ?? 0,
    durationMs: item.duration_ms ?? 0,
    device: body.device?.name ?? null,
  };
}

export const spotifyPlay = () => api('PUT', '/me/player/play');
export const spotifyPause = () => api('PUT', '/me/player/pause');
export const spotifyNext = () => api('POST', '/me/player/next');
export const spotifyPrevious = () => api('POST', '/me/player/previous');
