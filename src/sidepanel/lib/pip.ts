import { meetPipStatus, openMeetPipBeforeLeaving } from '@shared/pip';

/**
 * タブを切り替える・新しく開く操作の最初に呼ぶ。いま Meet を見ていれば小窓を開き始めてから先へ進む。
 * クリックの「本物の操作」の権利が残っているうちに呼ぶ必要があるので、他の await より前に置くこと。
 * タブ切り替えは待たせない（長くても 0.4 秒ほど）。開けたかどうかは少し後で確かめて、コンソールに残す。
 */
export async function leaveViaPip(windowId: number | undefined, goingToTabId?: number): Promise<void> {
  const { tabId, result } = await openMeetPipBeforeLeaving(windowId, goingToTabId);
  if (tabId === undefined || result === 'already') return;
  // 拡張を更新した直後の Meet タブでは受け口がまだ無い。タブを再読み込みすれば直る。パネルには出さない
  if (result === 'not-loaded') return console.warn('[engawa] meet pip: not loaded. Reload the Meet tab once to enable it');
  setTimeout(() => {
    void meetPipStatus(tabId).then((status) => {
      // 経過はコンソールにだけ残す。開けなかったときもパネルには出さない
      // （失敗の見分けが確実でなく、出ても利用者にできることが無いため）
      // 一度開いてから閉じた場合（すぐ Meet に戻った、自分で閉じた）は失敗ではない
      const opened = status.startsWith('open=true') || status.includes('opened-by=');
      if (opened) console.debug('[engawa] meet pip:', result, status);
      else console.warn('[engawa] meet pip did not open:', result, status);
    });
  }, 4000);
}
