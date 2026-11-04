import { useEffect, useState } from 'preact/hooks';
import { send } from '@shared/messages';
import { getPRSyncState, onPRSyncStateChanged } from '@shared/storage';
import { INITIAL_PR_SYNC_STATE, type ManagedFolders, type PRSyncState } from '@shared/types';
import { openContextMenu } from '../lib/contextMenu';
import { useBookmarkChildren, useRelativeTime } from '../lib/hooks';
import { openUrl, wantsBackground } from '../lib/open';
import { Favicon } from './Favicon';
import { Refresh } from './Icons';
import { Section } from './Section';

interface Props {
  folders: ManagedFolders;
  windowId: number | undefined;
  collapsed: boolean;
  onToggle: () => void;
}

const TITLE_RE = /^\[([^\]]+)#(\d+)\]\s*(.*)$/;

function PRRow({ node, windowId }: { node: chrome.bookmarks.BookmarkTreeNode; windowId: number | undefined }) {
  const url = node.url!;
  const m = TITLE_RE.exec(node.title);
  const chip = m ? `${m[1]} #${m[2]}` : null;
  const title = m ? m[3] : node.title;
  const open = (e: MouseEvent) => void openUrl(url, { reuse: true, background: wantsBackground(e), windowId });
  return (
    <div
      class="row"
      role="button"
      tabIndex={-1}
      data-nav
      title={`${node.title}\n${url}`}
      onClick={open}
      onAuxClick={(e) => {
        if (e.button === 1) open(e);
      }}
      onContextMenu={(e) =>
        openContextMenu(e, [
          { label: '開く', onSelect: () => openUrl(url, { reuse: true, windowId }) },
          { label: 'バックグラウンドで開く', onSelect: () => openUrl(url, { background: true, windowId }) },
          { separator: true },
          { label: 'URL をコピー', onSelect: () => navigator.clipboard.writeText(url) },
        ])
      }
    >
      <Favicon url={url} />
      {chip && <span class="pr-chip">{chip}</span>}
      <span class="title">{title}</span>
    </div>
  );
}

export function PRSection({ folders, windowId, collapsed, onToggle }: Props) {
  const review = useBookmarkChildren(folders.prReview).filter((n) => !!n.url);
  const mine = useBookmarkChildren(folders.prMine).filter((n) => !!n.url);
  const [sync, setSync] = useState<PRSyncState>(INITIAL_PR_SYNC_STATE);
  const rel = useRelativeTime(sync.lastSyncAt);

  useEffect(() => {
    void getPRSyncState().then(setSync);
    return onPRSyncStateChanged(setSync);
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
      {review.length === 0 ? <div class="empty-note">なし</div> : review.map((n) => <PRRow key={n.id} node={n} windowId={windowId} />)}
      <div class="pr-group-head">
        <span>自分のPR</span>
        <span class="badge">{mine.length}</span>
      </div>
      {mine.length === 0 ? <div class="empty-note">なし</div> : mine.map((n) => <PRRow key={n.id} node={n} windowId={windowId} />)}
    </Section>
  );
}
