/**
 * Google Meet の自動 Picture-in-Picture を Engawa 側で再現する。
 *
 * Chrome は Meet のタブを離れると自動で小窓を出し、戻ると閉じる。Vivaldi は権限の項目こそあるが発動しない。
 * 小窓を開く命令は「本物の操作の直後」にしか通らないので、
 *   開く: サイドパネルでのクリック（＝本物の操作）の中から、その権利を付けたまま Meet のページへスクリプトを送る
 *   閉じる: Meet のタブがアクティブになったらバックグラウンドから閉じる（こちらは操作の権利が要らない）
 * という形にする。Vivaldi のタブバーやショートカットで切り替えたときは、きっかけが無いので開けない。
 * ページ側の受け口は public/meet-pip.js。
 *
 * タブ切り替えを止めないこと。Meet 側の関数は戻ってこないことがあるので、どの呼び出しも短い時間で見切る。
 */
const MEET = /^https:\/\/meet\.google\.com\//;

type Method = 'open' | 'close' | 'status';

export function isMeetUrl(url: string | undefined): boolean {
  return MEET.test(url ?? '');
}

function timeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);
}

async function run(tabId: number, method: Method): Promise<string> {
  const call = chrome.scripting
    .executeScript({
      target: { tabId },
      world: 'MAIN',
      args: [method],
      // 同期関数にする。ページ側の Promise を待たない
      func: (m: Method) => {
        const api = (window as unknown as { __engawaPip?: Record<Method, () => string> }).__engawaPip;
        if (!api) return 'not-loaded';
        try {
          return api[m]();
        } catch (e) {
          return `error: ${e instanceof Error ? e.message : String(e)}`;
        }
      },
    })
    .then(([r]) => (r?.result as string | undefined) ?? 'no-result')
    .catch((e: unknown) => `error: ${e instanceof Error ? e.message : String(e)}`);
  return timeout(call, 400, 'timeout');
}

export interface PipAttempt {
  /** 小窓を開こうとした Meet のタブ。Meet を見ていなければ undefined */
  tabId?: number;
  result: string;
}

/**
 * いま見ているのが Meet なら、離れる前に小窓を開き始める。クリックの処理の最初に呼ぶこと。
 * 長くても 0.4 秒ほどで戻る。失敗しても例外にはしない。
 */
export async function openMeetPipBeforeLeaving(windowId: number | undefined, goingToTabId?: number): Promise<PipAttempt> {
  try {
    const [active] = await chrome.tabs.query({ active: true, ...(windowId !== undefined ? { windowId } : { currentWindow: true }) });
    if (active?.id === undefined || !isMeetUrl(active.url)) return { result: 'not-meet' };
    if (active.id === goingToTabId) return { result: 'not-leaving' };
    return { tabId: active.id, result: await run(active.id, 'open') };
  } catch (e) {
    return { result: `error: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** 開き始めた小窓が実際に出たか。ページ側の経過を文字列で返す。 */
export function meetPipStatus(tabId: number): Promise<string> {
  return run(tabId, 'status');
}

/** Meet のタブに戻ってきたら小窓を閉じる。 */
export async function closeMeetPip(tabId: number): Promise<void> {
  await run(tabId, 'close');
}
