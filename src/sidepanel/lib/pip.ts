import { meetPipStatus, openMeetPipBeforeLeaving } from '@shared/pip';

import { notice } from './notice';

/**
 * タブを切り替える・新しく開く操作の最初に呼ぶ。いま Meet を見ていれば小窓を開き始めてから先へ進む。
 * クリックの「本物の操作」の権利が残っているうちに呼ぶ必要があるので、他の await より前に置くこと。
 * タブ切り替えは待たせない（長くても 0.4 秒ほど）。開けたかどうかは少し後で確かめて、だめなら一言出す。
 */
export async function leaveViaPip(windowId: number | undefined, goingToTabId?: number): Promise<void> {
  const { tabId, result } = await openMeetPipBeforeLeaving(windowId, goingToTabId);
  if (tabId === undefined || result === 'already') return;
  if (result === 'not-loaded') return notice('Reload the Meet tab once to enable automatic picture-in-picture');
  setTimeout(() => {
    void meetPipStatus(tabId).then((status) => {
      // 経過はいつもコンソールに残し、パネルに出すのは失敗したときだけ
      console.debug('[engawa] meet pip:', result, status);
      // 一度開いてから閉じた場合（すぐ Meet に戻った、自分で閉じた）は失敗ではない
      const opened = status.startsWith('open=true') || status.includes('opened-by=');
      if (!opened) notice(`Picture-in-picture did not open (${result}; ${status})`);
    });
  }, 4000);
}
