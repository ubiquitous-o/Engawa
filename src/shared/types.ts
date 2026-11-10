/** 拡張の設定（chrome.storage.sync）。トークンは含めない。 */
export interface Settings {
  /** GitHub API のベース URL。GHE なら https://ghe.example.com/api/v3 */
  githubApiBase: string;
  /** PR 同期間隔（分） */
  syncIntervalMinutes: number;
  /** 新しいレビュー依頼を通知する */
  notifyReviewRequests: boolean;
  /** PR セクションを表示する */
  showPR: boolean;
  /** 開いているタブセクションを表示する */
  showTabs: boolean;
  /** パネルの下に Spotify の再生中の曲を表示する（接続しているときだけ出る） */
  showNowPlaying: boolean;
  /** 再生中の曲をどこから読むか。'api' = Spotify Web API（どの端末の再生でも）、'app' = この Mac の Spotify アプリ（橋が要る） */
  nowPlayingSource: 'api' | 'app';
  /** 再生中のジャケットの濃さ 0〜100。100 でそのまま、下げるとパネルの地に溶け込む */
  nowPlayingOpacity: number;
  /** アクセントカラー（CSS color） */
  accentColor: string;
  /** 表示密度。compact は行とタイルを詰めて、狭い幅でも多く見せる */
  density: 'comfortable' | 'compact';
  /** お気に入りタイルの大きさ（px）。タイルの最小幅で、アイコンもこれに比例する。compact はこの 0.8 倍 */
  favTileSize: number;
  /** 背景のテーマ */
  theme: Theme;
  /** ユーザーが保存した背景プリセット */
  customThemes: CustomTheme[];
}

/** 保存したプリセット。色だけでなく角度・強さ・グレインも丸ごと持つ。 */
export interface CustomTheme {
  id: string;
  name: string;
  theme: Theme;
}

/** 背景の見た目。Arc のテーマと同じく、2 色のグラデーションにグレインを乗せる。 */
export interface Theme {
  mode: 'solid' | 'gradient';
  /** グラデーションの始点色（solid ならこれだけ使う） */
  color1: string;
  color2: string;
  /** グラデーションの角度（deg） */
  angle: number;
  /** 色の強さ 0〜100。ベース色にどれだけ混ぜるか */
  intensity: number;
  /** グレイン（ノイズ）の濃さ 0〜100 */
  grain: number;
}

export const DEFAULT_THEME: Theme = {
  mode: 'gradient',
  color1: '#6366f1',
  color2: '#ec4899',
  angle: 160,
  intensity: 12,
  grain: 30,
};

export const THEME_PRESETS: { name: string; color1: string; color2: string }[] = [
  { name: 'Dusk', color1: '#6366f1', color2: '#ec4899' },
  { name: 'Engawa', color1: '#4f8f45', color2: '#9a6a3a' },
  { name: 'Ocean', color1: '#0ea5e9', color2: '#14b8a6' },
  { name: 'Sunset', color1: '#f97316', color2: '#f43f5e' },
  { name: 'Lavender', color1: '#8b5cf6', color2: '#0ea5e9' },
  { name: 'Moss', color1: '#10b981', color2: '#f59e0b' },
  { name: 'Slate', color1: '#64748b', color2: '#334155' },
];

export const DEFAULT_SETTINGS: Settings = {
  githubApiBase: 'https://api.github.com',
  syncIntervalMinutes: 5,
  notifyReviewRequests: true,
  showPR: true,
  showTabs: true,
  showNowPlaying: true,
  nowPlayingSource: 'app',
  nowPlayingOpacity: 100,
  accentColor: '#6366f1',
  density: 'comfortable',
  favTileSize: 48,
  theme: DEFAULT_THEME,
  customThemes: [],
};

export const FAV_TILE_SIZE = { min: 30, max: 80, step: 1 } as const;

export const ACCENT_PRESETS: { name: string; value: string }[] = [
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Violet', value: '#8b5cf6' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Rose', value: '#f43f5e' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Amber', value: '#f59e0b' },
  { name: 'Green', value: '#10b981' },
  { name: 'Teal', value: '#14b8a6' },
  { name: 'Sky', value: '#0ea5e9' },
  { name: 'Slate', value: '#64748b' },
];

/** GitHub から取った PR 1 件。ブックマークには書かず storage.local に置く。 */
export interface PRItem {
  url: string;
  title: string;
  repo: string;
  number: number;
}

export interface PRLists {
  review: PRItem[];
  mine: PRItem[];
}

export const EMPTY_PR_LISTS: PRLists = { review: [], mine: [] };

export type PRSyncStatus =
  | 'idle'
  | 'syncing'
  | 'ok'
  | 'no_token'
  | 'unauthorized'
  | 'rate_limited'
  | 'error';

export interface PRSyncState {
  status: PRSyncStatus;
  lastSyncAt: number | null;
  /** 表示用の短いエラー文。トークンは絶対に含めない */
  lastError: string | null;
  reviewCount: number;
  mineCount: number;
  /** レート制限時の倍率（1, 2, 4, ...） */
  backoff: number;
  nextRunAt: number | null;
}

export const INITIAL_PR_SYNC_STATE: PRSyncState = {
  status: 'idle',
  lastSyncAt: null,
  lastError: null,
  reviewCount: 0,
  mineCount: 0,
  backoff: 1,
  nextRunAt: null,
};

/** お気に入り 1 件に対応しているタブの状態 */
export interface FavoriteTabState {
  tabId: number;
  windowId: number;
  active: boolean;
  /** タブが現在表示している URL（ブックマークの URL と違うことがある） */
  currentUrl: string;
  /** ブックマーク URL から離れているか */
  drifted: boolean;
}

export type FavoritesState = Record<string, FavoriteTabState>;

/** サイドパネル内ドラッグのペイロード */
export type DragPayload =
  | { kind: 'bookmark'; id: string; parentId: string; index: number; url?: string; title: string }
  | { kind: 'tab'; tabId: number; url: string; title: string };
