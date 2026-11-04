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
  /** アクセントカラー（CSS color） */
  accentColor: string;
  /** 表示密度。compact は行とタイルを詰めて、狭い幅でも多く見せる */
  density: 'comfortable' | 'compact';
}

export const DEFAULT_SETTINGS: Settings = {
  githubApiBase: 'https://api.github.com',
  syncIntervalMinutes: 5,
  notifyReviewRequests: true,
  showPR: true,
  showTabs: true,
  accentColor: '#6366f1',
  density: 'comfortable',
};

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
