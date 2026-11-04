import { ensureManagedFolders, getChildrenSafe } from '@shared/bookmarks';
import {
  getNotificationUrls,
  getPRSyncState,
  getSettings,
  getToken,
  setNotificationUrls,
  updatePRSyncState,
} from '@shared/storage';
import type { PRSyncState } from '@shared/types';
import { normalizeUrl } from '@shared/url';

export const ALARM_NAME = 'github-sync';
const MAX_BACKOFF = 8;

const QUERIES = {
  prReview: 'is:pr is:open archived:false review-requested:@me',
  prMine: 'is:pr is:open archived:false author:@me',
} as const;

interface PRItem {
  url: string;
  title: string;
}

interface SearchResponse {
  items?: Array<{ html_url: string; title: string; number: number; repository_url: string }>;
}

class GitHubError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function apiBaseFrom(base: string): string {
  return base.replace(/\/+$/, '');
}

/** 検索 API を叩く。エラーメッセージにトークンは絶対に入れない。 */
async function searchPRs(apiBase: string, token: string, query: string): Promise<PRItem[]> {
  const url = `${apiBase}/search/issues?q=${encodeURIComponent(query)}&per_page=50`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
  } catch {
    throw new GitHubError(0, 'GitHub に接続できない');
  }
  if (!res.ok) {
    throw new GitHubError(res.status, `GitHub API エラー (HTTP ${res.status})`);
  }
  const body = (await res.json()) as SearchResponse;
  return (body.items ?? []).map((it) => {
    const repo = it.repository_url.split('/').pop() ?? '';
    return { url: it.html_url, title: `[${repo}#${it.number}] ${it.title}` };
  });
}

/**
 * 管理フォルダの中身を PR 一覧と差分同期する。
 * このフォルダの直下の「URL を持つブックマーク」だけを触る。サブフォルダや他のブックマークには触れない。
 * @returns 新しく追加された PR
 */
async function syncFolder(folderId: string, items: PRItem[]): Promise<PRItem[]> {
  const children = (await getChildrenSafe(folderId)).filter((c) => !!c.url);
  const byUrl = new Map(children.map((c) => [normalizeUrl(c.url), c] as const));
  const wanted = new Map(items.map((it) => [normalizeUrl(it.url), it] as const));
  const added: PRItem[] = [];

  for (const [key, node] of byUrl) {
    if (!wanted.has(key)) await chrome.bookmarks.remove(node.id);
  }
  let index = 0;
  for (const [key, item] of wanted) {
    const node = byUrl.get(key);
    if (!node) {
      await chrome.bookmarks.create({ parentId: folderId, title: item.title, url: item.url, index });
      added.push(item);
    } else {
      if (node.title !== item.title) await chrome.bookmarks.update(node.id, { title: item.title });
      if (node.index !== index) await chrome.bookmarks.move(node.id, { parentId: folderId, index });
    }
    index++;
  }
  return added;
}

async function setBadge(text: string, color: string): Promise<void> {
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color });
  try {
    await chrome.action.setBadgeTextColor({ color: '#ffffff' });
  } catch {
    // 古い Chrome では未対応
  }
}

async function notifyNewReviews(added: PRItem[]): Promise<void> {
  if (added.length === 0) return;
  const map = await getNotificationUrls();
  const iconUrl = chrome.runtime.getURL('icons/icon128.png');
  if (added.length > 3) {
    const id = `review-batch-${Date.now()}`;
    map[id] = added[0]!.url;
    await chrome.notifications.create(id, {
      type: 'basic',
      iconUrl,
      title: `新しいレビュー依頼 ${added.length} 件`,
      message: added.map((a) => a.title).slice(0, 5).join('\n'),
    });
  } else {
    for (const item of added) {
      const id = `review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      map[id] = item.url;
      await chrome.notifications.create(id, {
        type: 'basic',
        iconUrl,
        title: '新しいレビュー依頼',
        message: item.title,
      });
    }
  }
  await setNotificationUrls(map);
}

export async function scheduleAlarm(): Promise<void> {
  const settings = await getSettings();
  const state = await getPRSyncState();
  const period = Math.max(1, settings.syncIntervalMinutes) * Math.max(1, state.backoff);
  await chrome.alarms.create(ALARM_NAME, { delayInMinutes: period, periodInMinutes: period });
  await updatePRSyncState({ nextRunAt: Date.now() + period * 60_000 });
}

let syncing: Promise<PRSyncState> | null = null;

/** PR フォルダを GitHub と同期する。多重実行は 1 本にまとめる。 */
export function syncPRs(): Promise<PRSyncState> {
  if (syncing) return syncing;
  syncing = doSync().finally(() => {
    syncing = null;
  });
  return syncing;
}

async function doSync(): Promise<PRSyncState> {
  const settings = await getSettings();
  const token = await getToken();
  const prev = await getPRSyncState();
  const accent = settings.accentColor;

  if (!token) {
    await setBadge('', accent);
    return updatePRSyncState({ status: 'no_token', lastError: null, nextRunAt: null });
  }

  await updatePRSyncState({ status: 'syncing', lastError: null });
  const apiBase = apiBaseFrom(settings.githubApiBase);
  const folders = await ensureManagedFolders();

  try {
    const [review, mine] = await Promise.all([
      searchPRs(apiBase, token, QUERIES.prReview),
      searchPRs(apiBase, token, QUERIES.prMine),
    ]);
    const addedReview = await syncFolder(folders.prReview, review);
    await syncFolder(folders.prMine, mine);

    // 初回同期（フォルダが空だった初回）は通知しない。以後は新規分だけ通知。
    if (settings.notifyReviewRequests && prev.lastSyncAt !== null) {
      await notifyNewReviews(addedReview);
    }
    await setBadge(review.length > 0 ? String(review.length) : '', accent);
    const next = await updatePRSyncState({
      status: 'ok',
      lastSyncAt: Date.now(),
      lastError: null,
      reviewCount: review.length,
      mineCount: mine.length,
      backoff: 1,
    });
    await scheduleAlarm();
    return next;
  } catch (e) {
    const status = e instanceof GitHubError ? e.status : -1;
    if (status === 401) {
      await setBadge('!', '#dc2626');
      const next = await updatePRSyncState({
        status: 'unauthorized',
        lastError: 'トークンが無効。設定画面で入れ直して',
        nextRunAt: null,
      });
      await chrome.alarms.clear(ALARM_NAME);
      return next;
    }
    if (status === 403 || status === 429) {
      const backoff = Math.min(MAX_BACKOFF, Math.max(1, prev.backoff) * 2);
      const next = await updatePRSyncState({
        status: 'rate_limited',
        lastError: `レート制限。間隔を ${backoff} 倍にして再試行`,
        backoff,
      });
      await scheduleAlarm();
      return next;
    }
    const next = await updatePRSyncState({
      status: 'error',
      lastError: e instanceof Error ? e.message : '不明なエラー',
    });
    await scheduleAlarm();
    return next;
  }
}

/** トークンの疎通確認。/user を叩いてログイン名を返す。 */
export async function testToken(
  token: string | null,
  apiBase: string,
): Promise<{ ok: true; login: string } | { ok: false; error: string }> {
  if (!token) return { ok: false, error: 'トークンが未設定' };
  try {
    const res = await fetch(`${apiBaseFrom(apiBase)}/user`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (res.status === 401) return { ok: false, error: 'トークンが無効 (401)' };
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const body = (await res.json()) as { login?: string };
    return { ok: true, login: body.login ?? '(不明)' };
  } catch {
    return { ok: false, error: '接続できない。URL とホスト権限を確認して' };
  }
}

export function registerGitHubListeners(): void {
  chrome.notifications.onClicked.addListener(async (id) => {
    const map = await getNotificationUrls();
    const url = map[id];
    if (url) {
      await chrome.tabs.create({ url });
      delete map[id];
      await setNotificationUrls(map);
    }
    chrome.notifications.clear(id);
  });
}
