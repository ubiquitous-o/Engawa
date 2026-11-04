import { useEffect, useState } from 'preact/hooks';
import { send } from '@shared/messages';
import { getPRLists, getPRSyncState, onPRListsChanged, onPRSyncStateChanged } from '@shared/storage';
import { EMPTY_PR_LISTS, INITIAL_PR_SYNC_STATE, type PRItem, type PRLists, type PRSyncState } from '@shared/types';
import { openContextMenu } from '../lib/contextMenu';
import { useRelativeTime } from '../lib/hooks';
import { openUrl, wantsBackground } from '../lib/open';
import { Favicon } from './Favicon';
import { Refresh } from './Icons';
import { Section } from './Section';

interface Props {
  windowId: number | undefined;
  collapsed: boolean;
  onToggle: () => void;
}

function PRRow({ item, windowId }: { item: PRItem; windowId: number | undefined }) {
  const chip = `${item.repo} #${item.number}`;
  const open = (e: MouseEvent) => void openUrl(item.url, { reuse: true, background: wantsBackground(e), windowId });
  return (
    <div
      class="row"
      role="button"
      tabIndex={-1}
      data-nav
      title={`[${chip}] ${item.title}\n${item.url}`}
      onClick={open}
      onAuxClick={(e) => {
        if (e.button === 1) open(e);
      }}
      onContextMenu={(e) =>
        openContextMenu(e, [
          { label: '開く', onSelect: () => openUrl(item.url, { reuse: true, windowId }) },
          { label: 'バックグラウンドで開く', onSelect: () => openUrl(item.url, { background: true, windowId }) },
          { separator: true },
          { label: 'URL をコピー', onSelect: () => navigator.clipboard.writeText(item.url) },
        ])
      }
    >
      <Favicon url={item.url} />
      <span class="pr-chip">{chip}</span>
      <span class="title">{item.title}</span>
    </div>
  );
}

/** PR 一覧。GitHub から取った結果を storage.local に持ち、ブックマークには書かない。 */
export function PRSection({ windowId, collapsed, onToggle }: Props) {
  const [lists, setLists] = useState<PRLists>(EMPTY_PR_LISTS);
  const [sync, setSync] = useState<PRSyncState>(INITIAL_PR_SYNC_STATE);
  const rel = useRelativeTime(sync.lastSyncAt);

  useEffect(() => {
    void getPRLists().then(setLists);
    void getPRSyncState().then(setSync);
    const offLists = onPRListsChanged(setLists);
    const offSync = onPRSyncStateChanged(setSync);
    return () => {
      offLists();
      offSync();
    };
  }, []);

  const syncNow = () => {
    send({ type: 'pr:sync' }).then(setSync).catch(() => {});
  };
  const openOptions = () => void chrome.runtime.openOptionsPage();

  let status: { cls: string; text: string; action?: string } | null = null;
  switch (sync.status) {
    case 'no_token':
      status = { cls: 'warn', text: 'GitHub トークンが未設定', action: '設定を開く' };
      break;
    case 'unauthorized':
      status = { cls: 'error', text: 'トークンが無効', action: '設定を開く' };
      break;
    case 'rate_limited':
      status = { cls: 'warn', text: `レート制限中。間隔を ${sync.backoff} 倍にして再試行` };
      break;
    case 'error':
      status = { cls: 'error', text: sync.lastError ?? 'エラー' };
      break;
  }

  const { review, mine } = lists;
  return (
    <Section
      title="Pull Requests"
      count={review.length + mine.length}
      collapsed={collapsed}
      onToggle={onToggle}
      meta={sync.status === 'syncing' ? '同期中…' : rel}
      actions={
        <button
          class={`icon-btn ${sync.status === 'syncing' ? 'spin' : ''}`}
          title="今すぐ同期"
          onClick={syncNow}
          disabled={sync.status === 'syncing'}
        >
          <Refresh />
        </button>
      }
    >
      {status && (
        <div class={`pr-status ${status.cls}`}>
          <span style="flex:1">{status.text}</span>
          {status.action && (
            <button class="link" onClick={openOptions}>
              {status.action}
            </button>
          )}
        </div>
      )}
      <div class="pr-group-head">
        <span>レビュー依頼</span>
        <span class="badge">{review.length}</span>
      </div>
      {review.length === 0 ? <div class="empty-note">なし</div> : review.map((p) => <PRRow key={p.url} item={p} windowId={windowId} />)}
      <div class="pr-group-head">
        <span>自分のPR</span>
        <span class="badge">{mine.length}</span>
      </div>
      {mine.length === 0 ? <div class="empty-note">なし</div> : mine.map((p) => <PRRow key={p.url} item={p} windowId={windowId} />)}
    </Section>
  );
}
