import {
  DEFAULT_SETTINGS,
  INITIAL_PR_SYNC_STATE,
  type ManagedFolders,
  type PRSyncState,
  type Settings,
} from './types';

const KEY_SETTINGS = 'settings';
const KEY_TOKEN = 'githubToken';
const KEY_FOLDERS = 'managedFolders';
const KEY_PR_STATE = 'prSyncState';
const KEY_EXPANDED = 'expandedFolders';
const KEY_COLLAPSED = 'collapsedSections';
const KEY_FAV_MAP = 'favTabMap';
const KEY_NOTIF = 'notificationUrls';
const KEY_FAV_FOLDER = 'favoritesFolderId';

// ---- 設定（sync） ----

export async function getSettings(): Promise<Settings> {
  const r = await chrome.storage.sync.get(KEY_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...((r[KEY_SETTINGS] as Partial<Settings> | undefined) ?? {}) };
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.sync.set({ [KEY_SETTINGS]: next });
  return next;
}

export function onSettingsChanged(cb: (s: Settings) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'sync' && changes[KEY_SETTINGS]) {
      cb({ ...DEFAULT_SETTINGS, ...((changes[KEY_SETTINGS].newValue as Partial<Settings>) ?? {}) });
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

// ---- GitHub トークン（local のみ。sync には絶対に入れない） ----

export async function getToken(): Promise<string | null> {
  const r = await chrome.storage.local.get(KEY_TOKEN);
  const t = r[KEY_TOKEN];
  return typeof t === 'string' && t.length > 0 ? t : null;
}

export async function setToken(token: string | null): Promise<void> {
  if (token) await chrome.storage.local.set({ [KEY_TOKEN]: token });
  else await chrome.storage.local.remove(KEY_TOKEN);
}

export function onTokenChanged(cb: () => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && changes[KEY_TOKEN]) cb();
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

// ---- 管理フォルダ ID（local） ----

export async function getManagedFolders(): Promise<ManagedFolders | null> {
  const r = await chrome.storage.local.get(KEY_FOLDERS);
  return (r[KEY_FOLDERS] as ManagedFolders | undefined) ?? null;
}

export async function setManagedFolders(f: ManagedFolders): Promise<void> {
  await chrome.storage.local.set({ [KEY_FOLDERS]: f });
}

// ---- お気に入りとして表示するフォルダ（local、端末ごと。ブックマーク ID は端末で違う） ----

export async function getFavoritesFolderIdRaw(): Promise<string | null> {
  const r = await chrome.storage.local.get(KEY_FAV_FOLDER);
  return (r[KEY_FAV_FOLDER] as string | undefined) ?? null;
}

export async function setFavoritesFolderId(id: string | null): Promise<void> {
  if (id) await chrome.storage.local.set({ [KEY_FAV_FOLDER]: id });
  else await chrome.storage.local.remove(KEY_FAV_FOLDER);
}

export function onFavoritesFolderChanged(cb: () => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && changes[KEY_FAV_FOLDER]) cb();
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

// ---- PR 同期状態（local） ----

export async function getPRSyncState(): Promise<PRSyncState> {
  const r = await chrome.storage.local.get(KEY_PR_STATE);
  return { ...INITIAL_PR_SYNC_STATE, ...((r[KEY_PR_STATE] as Partial<PRSyncState> | undefined) ?? {}) };
}

export async function updatePRSyncState(patch: Partial<PRSyncState>): Promise<PRSyncState> {
  const next = { ...(await getPRSyncState()), ...patch };
  await chrome.storage.local.set({ [KEY_PR_STATE]: next });
  return next;
}

export function onPRSyncStateChanged(cb: (s: PRSyncState) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && changes[KEY_PR_STATE]) {
      cb({ ...INITIAL_PR_SYNC_STATE, ...((changes[KEY_PR_STATE].newValue as Partial<PRSyncState>) ?? {}) });
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

// ---- UI 状態（local） ----

export async function getExpandedFolders(): Promise<string[] | null> {
  const r = await chrome.storage.local.get(KEY_EXPANDED);
  return (r[KEY_EXPANDED] as string[] | undefined) ?? null;
}

export async function setExpandedFolders(ids: string[]): Promise<void> {
  await chrome.storage.local.set({ [KEY_EXPANDED]: ids });
}

export async function getCollapsedSections(): Promise<string[]> {
  const r = await chrome.storage.local.get(KEY_COLLAPSED);
  return (r[KEY_COLLAPSED] as string[] | undefined) ?? [];
}

export async function setCollapsedSections(ids: string[]): Promise<void> {
  await chrome.storage.local.set({ [KEY_COLLAPSED]: ids });
}

// ---- セッション限定（ブラウザ再起動で消える） ----

export async function getFavTabMap(): Promise<Record<string, number>> {
  const r = await chrome.storage.session.get(KEY_FAV_MAP);
  return (r[KEY_FAV_MAP] as Record<string, number> | undefined) ?? {};
}

export async function setFavTabMap(map: Record<string, number>): Promise<void> {
  await chrome.storage.session.set({ [KEY_FAV_MAP]: map });
}

export async function getNotificationUrls(): Promise<Record<string, string>> {
  const r = await chrome.storage.session.get(KEY_NOTIF);
  return (r[KEY_NOTIF] as Record<string, string> | undefined) ?? {};
}

export async function setNotificationUrls(map: Record<string, string>): Promise<void> {
  await chrome.storage.session.set({ [KEY_NOTIF]: map });
}
