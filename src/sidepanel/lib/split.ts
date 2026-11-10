/**
 * 2 つのタブを 1 画面に並べる。ブラウザごとに仕組みが違う。
 *
 * Chrome: Split View。tabs.createSplit / tabs.unsplit（Chrome 155 以降）。@types/chrome にまだ無い。
 *
 * Vivaldi: Chrome の Split View は描かない（createSplit は成功して splitViewId も付くが、画面は 1 ページのまま）。
 *   代わりに自前の「タブのタイル表示」があり、状態はタブごとの vivExtData（JSON 文字列）の tiling に入る。
 *     tiling: { id: 同じタイルで共通の ID, layout: 'row'（左右）| 'column'（上下）, type: 'selection', index: 並び順 }
 *   tabs.update に vivExtData を渡すと、Vivaldi は既存の値へ合成する（書かなかったキーは残る。null で消える）。
 *   普通の拡張には vivExtData が読めないことがあるので、読まずに差分だけ書き、
 *   どのタブをタイルにしたかは自分で storage.session に覚えておく。
 *   公式に文書化された API ではない。書けなければ（Chrome ではここで例外になる）Split View に回す。
 */
interface SplitApi {
  createSplit?: (tabIds: [number, number]) => Promise<number>;
  unsplit?: (splitViewId: number) => Promise<void>;
}

/** ドラッグしたタブを、表示中のタブのどちら側に置くか。 */
export type SplitSide = 'left' | 'right' | 'top' | 'bottom';

const api = chrome.tabs as unknown as SplitApi;
// Vivaldi のタイルが使えるか。一度試すまでは分からない（null）。
// 上下に並べられるのは Vivaldi のタイルだけで、Chrome の Split View は左右のみ。
let vivaldiTiling: boolean | null = null;

/** 上下の分割ができるか。Vivaldi のタイルが使えると確かめられたときだけ。 */
export function verticalSplitPossible(): boolean {
  return vivaldiTiling === true;
}
const NONE = -1;
const KEY_TILES = 'vivaldiTiles';

/** 自分で作った Vivaldi のタイル。タブ ID → タイル ID と相手のタブ ID。 */
export type VivaldiTiles = Record<string, { id: string; peer: number }>;

export async function getVivaldiTiles(): Promise<VivaldiTiles> {
  const r = await chrome.storage.session.get(KEY_TILES);
  return (r[KEY_TILES] as VivaldiTiles | undefined) ?? {};
}

async function setVivaldiTiles(tiles: VivaldiTiles): Promise<void> {
  await chrome.storage.session.set({ [KEY_TILES]: tiles });
}

export function onVivaldiTilesChanged(cb: () => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'session' && changes[KEY_TILES]) cb();
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

/** タブが入っている Split View の ID。入っていなければ -1。 */
function splitViewIdOf(tab: chrome.tabs.Tab): number {
  return (tab as { splitViewId?: number }).splitViewId ?? NONE;
}

async function unsplitChrome(splitViewId: number): Promise<void> {
  if (splitViewId !== NONE && api.unsplit) await api.unsplit(splitViewId);
}

/** vivExtData へ差分を書く。Vivaldi 以外では未知のプロパティとして例外になる。 */
async function patchVivData(tabId: number, patch: Record<string, unknown>): Promise<void> {
  await chrome.tabs.update(tabId, { vivExtData: JSON.stringify(patch) } as chrome.tabs.UpdateProperties);
}

/**
 * Vivaldi のタイルが使えるかを起動時に確かめる。
 * 空の差分を書くだけなので、Vivaldi では何も変わらない（合成されるだけ）。Chrome では例外になる。
 */
export async function probeVivaldiTiling(tabId: number): Promise<void> {
  if (vivaldiTiling !== null) return;
  try {
    await patchVivData(tabId, {});
    vivaldiTiling = true;
  } catch {
    vivaldiTiling = false;
  }
}

/** 自分で作ったタイルを解く。相手のタブも一緒に戻す。 */
async function untileVivaldi(tabId: number): Promise<void> {
  const tiles = await getVivaldiTiles();
  const mine = tiles[tabId];
  if (!mine) return;
  for (const id of [tabId, mine.peer]) {
    delete tiles[id];
    await patchVivData(id, { tiling: null }).catch(() => undefined); // 閉じたタブなら失敗してよい
  }
  await setVivaldiTiles(tiles);
}

/**
 * 2 つを並べる。layout は 'row'（左右）か 'column'（上下）。firstId が左または上。
 * 書けたら true、Vivaldi でなければ（書けなければ）false。
 */
async function tileVivaldi(firstId: number, secondId: number, layout: 'row' | 'column'): Promise<boolean> {
  const id = crypto.randomUUID();
  const tiling = (index: number) => ({ tiling: { id, layout, type: 'selection', index } });
  try {
    await patchVivData(firstId, tiling(0));
  } catch {
    vivaldiTiling = false;
    return false;
  }
  vivaldiTiling = true;
  await patchVivData(secondId, tiling(1));
  const tiles = await getVivaldiTiles();
  tiles[firstId] = { id, peer: secondId };
  tiles[secondId] = { id, peer: firstId };
  await setVivaldiTiles(tiles);
  return true;
}

/** 一覧で「分割中」と見せるためのキー。Chrome の Split View か、自分で作った Vivaldi のタイル。なければ null。 */
export function splitKeyOf(tab: chrome.tabs.Tab, tiles: VivaldiTiles): string | null {
  const viv = tab.id !== undefined ? tiles[tab.id] : undefined;
  if (viv) return `viv:${viv.id}`;
  const id = splitViewIdOf(tab);
  return id !== NONE ? `split:${id}` : null;
}

/** そのタブの分割（Chrome / Vivaldi どちらでも）を解く。 */
export async function unsplitTab(tab: chrome.tabs.Tab): Promise<void> {
  if (tab.id !== undefined) await untileVivaldi(tab.id);
  await unsplitChrome(splitViewIdOf(tab));
}

/** もう無いタブの記録を捨てる。 */
export async function pruneVivaldiTiles(): Promise<void> {
  const tiles = await getVivaldiTiles();
  if (Object.keys(tiles).length === 0) return;
  const aliveTabIds = new Set((await chrome.tabs.query({})).map((t) => t.id ?? -1));
  let changed = false;
  for (const [key, v] of Object.entries(tiles)) {
    if (aliveTabIds.has(Number(key)) && aliveTabIds.has(v.peer)) continue;
    delete tiles[key];
    changed = true;
  }
  if (changed) await setVivaldiTiles(tiles);
}

/**
 * dragId のタブを targetId のタブの隣へ動かし、side の側に置いて 2 つを分割表示にする。
 * 上下（top / bottom）は Vivaldi のタイルだけ。Chrome の Split View では上→左、下→右として並べる。
 * createSplit は「隣り合っていて、同じウィンドウ・同じピン留め状態・同じグループで、
 * どちらもまだ分割されていない」ことを要求するので、先にそこまで揃える。
 */
export async function splitTabs(dragId: number, targetId: number, side: SplitSide = 'right'): Promise<void> {
  const dragFirst = side === 'left' || side === 'top';
  if (dragId === targetId) return;

  let [drag, target] = await Promise.all([chrome.tabs.get(dragId), chrome.tabs.get(targetId)]);

  // すでに分割中なら解いてから組み直す
  await untileVivaldi(dragId);
  await untileVivaldi(targetId);
  const a = splitViewIdOf(drag);
  const b = splitViewIdOf(target);
  await unsplitChrome(a);
  if (b !== a) await unsplitChrome(b);

  if (drag.pinned !== target.pinned) await chrome.tabs.update(dragId, { pinned: target.pinned });

  const targetGroup = target.groupId ?? -1;
  if ((drag.groupId ?? -1) !== targetGroup || drag.windowId !== target.windowId) {
    if (drag.windowId !== target.windowId) await chrome.tabs.move(dragId, { windowId: target.windowId, index: -1 });
    if (targetGroup >= 0) await chrome.tabs.group({ tabIds: dragId, groupId: targetGroup });
    else if ((drag.groupId ?? -1) >= 0) await chrome.tabs.ungroup(dragId);
  }

  // 上の操作で位置が変わるので取り直してから隣へ寄せる。
  // move の index は「抜いた後」の位置なので、左から来るときは target が 1 つ前へ詰まる分を引く
  [drag, target] = await Promise.all([chrome.tabs.get(dragId), chrome.tabs.get(targetId)]);
  const targetAfter = drag.index < target.index ? target.index - 1 : target.index;
  const dest = dragFirst ? targetAfter : targetAfter + 1;
  if (drag.index !== dest) await chrome.tabs.move(dragId, { index: dest });

  const [firstId, secondId]: [number, number] = dragFirst ? [dragId, targetId] : [targetId, dragId];
  const layout = side === 'top' || side === 'bottom' ? 'column' : 'row';
  if (!(await tileVivaldi(firstId, secondId, layout))) {
    if (!api.createSplit) throw new Error('Split view needs Chrome 155 or later');
    await api.createSplit([firstId, secondId]);
  }
  await chrome.tabs.update(dragId, { active: true });
}
