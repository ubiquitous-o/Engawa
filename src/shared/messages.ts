import type { FavoritesState, PRSyncState } from './types';

/** サイドパネル/設定画面 → バックグラウンド のメッセージ */
export type Request =
  | { type: 'fav:state' }
  | { type: 'fav:open'; bookmarkId: string; windowId?: number }
  | { type: 'fav:restore'; bookmarkId: string }
  | { type: 'fav:closeTab'; bookmarkId: string }
  | { type: 'pr:sync' }
  | { type: 'github:test'; token?: string; apiBase?: string };

export interface ResponseMap {
  'fav:state': FavoritesState;
  'fav:open': { tabId: number };
  'fav:restore': { ok: boolean };
  'fav:closeTab': { ok: boolean };
  'pr:sync': PRSyncState;
  'github:test': { ok: true; login: string } | { ok: false; error: string };
}

type Envelope<T> = { ok: true; data: T } | { ok: false; error: string };

export async function send<R extends Request>(req: R): Promise<ResponseMap[R['type']]> {
  const res = (await chrome.runtime.sendMessage(req)) as Envelope<ResponseMap[R['type']]> | undefined;
  if (!res) throw new Error('バックグラウンドから応答がない');
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

export function respond<T>(data: T): Envelope<T> {
  return { ok: true, data };
}

export function respondError(e: unknown): Envelope<never> {
  return { ok: false, error: e instanceof Error ? e.message : String(e) };
}
