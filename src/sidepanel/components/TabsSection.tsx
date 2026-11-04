import { useCallback, useEffect, useState } from 'preact/hooks';
import { send } from '@shared/messages';
import { hostOf } from '@shared/url';
import { endDrag, startDrag } from '../lib/dnd';
import { openContextMenu } from '../lib/contextMenu';
import { useChromeEvents } from '../lib/hooks';
import { addToFavorites } from '../lib/open';
import { Favicon } from './Favicon';
import { Audio, Chevron, Close, Muted, Pin } from './Icons';
import { Section } from './Section';

const TAB_EVENTS = [
  chrome.tabs.onCreated,
  chrome.tabs.onRemoved,
  chrome.tabs.onUpdated,
  chrome.tabs.onActivated,
  chrome.tabs.onMoved,
  chrome.tabs.onAttached,
  chrome.tabs.onDetached,
  chrome.tabs.onReplaced,
  chrome.tabGroups.onCreated,
  chrome.tabGroups.onRemoved,
  chrome.tabGroups.onUpdated,
  chrome.tabGroups.onMoved,
];

const GROUP_COLORS: Record<string, string> = {
  grey: '#8a8f98',
  blue: '#3b82f6',
  red: '#ef4444',
  yellow: '#eab308',
  green: '#22c55e',
  pink: '#ec4899',
  purple: '#a855f7',
  cyan: '#06b6d4',
  orange: '#f97316',
};

interface Props {
  favoritesFolderId: string;
  windowId: number | undefined;
  collapsed: boolean;
  onToggle: () => void;
}

type Block = { kind: 'tab'; tab: chrome.tabs.Tab } | { kind: 'group'; group: chrome.tabGroups.TabGroup; tabs: chrome.tabs.Tab[] };

export function TabsSection({ favoritesFolderId, windowId, collapsed, onToggle }: Props) {
  const [tabs, setTabs] = useState<chrome.tabs.Tab[]>([]);
  const [groups, setGroups] = useState<Map<number, chrome.tabGroups.TabGroup>>(new Map());
  // お気に入りに対応しているタブ。Arc の固定タブと同じで、一覧には出さずタイルの印で表す
  const [favTabIds, setFavTabIds] = useState<Set<number>>(new Set());

  const reload = useCallback(() => {
    if (windowId === undefined) return;
    void Promise.all([
      chrome.tabs.query({ windowId }),
      chrome.tabGroups.query({ windowId }),
      send({ type: 'fav:state' }).catch(() => ({})),
    ]).then(([t, g, fav]) => {
      setTabs(t.sort((a, b) => a.index - b.index));
      setGroups(new Map(g.map((x) => [x.id, x])));
      setFavTabIds(new Set(Object.values(fav).map((s) => s.tabId)));
    });
  }, [windowId]);
  useEffect(reload, [reload]);
  useChromeEvents(TAB_EVENTS, reload, 80);

  // 連続した同じグループのタブをひとまとめにする
  const visible = tabs.filter((t) => t.id === undefined || !favTabIds.has(t.id));
  const blocks: Block[] = [];
  for (const tab of visible) {
    const gid = tab.groupId ?? -1;
    const group = gid >= 0 ? groups.get(gid) : undefined;
    const last = blocks[blocks.length - 1];
    if (group) {
      if (last?.kind === 'group' && last.group.id === group.id) last.tabs.push(tab);
      else blocks.push({ kind: 'group', group, tabs: [tab] });
    } else {
      blocks.push({ kind: 'tab', tab });
    }
  }

  const activate = (tab: chrome.tabs.Tab) => {
    if (tab.id !== undefined) void chrome.tabs.update(tab.id, { active: true });
  };
  const close = (tab: chrome.tabs.Tab) => {
    if (tab.id !== undefined) void chrome.tabs.remove(tab.id);
  };

  const renderTab = (tab: chrome.tabs.Tab) => {
    const url = tab.url ?? tab.pendingUrl ?? '';
    const title = tab.title || hostOf(url) || '新しいタブ';
    return (
      <div
        key={tab.id}
        class={`row ${tab.active ? 'active-tab' : ''}`}
        role="button"
        tabIndex={-1}
        data-nav
        title={`${title}\n${url}`}
        draggable={/^https?:/.test(url)}
        onClick={() => activate(tab)}
        onAuxClick={(e) => {
          if (e.button === 1) close(tab);
        }}
        onDragStart={(e) => startDrag(e, { kind: 'tab', tabId: tab.id ?? -1, url, title })}
        onDragEnd={endDrag}
        onContextMenu={(e) =>
          openContextMenu(e, [
            { label: 'お気に入りに追加', disabled: !/^https?:/.test(url), onSelect: () => addToFavorites(favoritesFolderId, { title, url }) },
            { label: tab.pinned ? 'ピン留めを解除' : 'ピン留め', onSelect: () => chrome.tabs.update(tab.id!, { pinned: !tab.pinned }) },
            { label: tab.mutedInfo?.muted ? 'ミュート解除' : 'ミュート', onSelect: () => chrome.tabs.update(tab.id!, { muted: !tab.mutedInfo?.muted }) },
            { label: '再読み込み', onSelect: () => chrome.tabs.reload(tab.id!) },
            { label: '複製', onSelect: () => chrome.tabs.duplicate(tab.id!) },
            { separator: true },
            { label: 'URL をコピー', disabled: !url, onSelect: () => navigator.clipboard.writeText(url) },
            { label: '閉じる', danger: true, onSelect: () => close(tab) },
          ])
        }
      >
        {tab.pinned && <Pin class="pin" />}
        <Favicon url={url} src={tab.favIconUrl} />
        <span class="title">{title}</span>
        {tab.mutedInfo?.muted ? <Muted class="audio" /> : tab.audible ? <Audio class="audio" /> : null}
        <button
          class="hover-btn"
          title="閉じる"
          onClick={(e) => {
            e.stopPropagation();
            close(tab);
          }}
        >
          <Close />
        </button>
      </div>
    );
  };

  return (
    <Section title="タブ" count={visible.length} collapsed={collapsed} onToggle={onToggle}>
      {blocks.map((b) =>
        b.kind === 'tab' ? (
          renderTab(b.tab)
        ) : (
          <div
            key={`g${b.group.id}`}
            class={`tab-group ${b.group.collapsed ? '' : 'open'}`}
            style={{ '--group-color': GROUP_COLORS[b.group.color] ?? '#8a8f98' } as Record<string, string>}
          >
            <div
              class="tab-group-head"
              role="button"
              tabIndex={-1}
              data-nav
              onClick={() => void chrome.tabGroups.update(b.group.id, { collapsed: !b.group.collapsed })}
            >
              <Chevron />
              <span class="title">{b.group.title || '無題のグループ'}</span>
              <span class="count">{b.tabs.length}</span>
            </div>
            {!b.group.collapsed && b.tabs.map(renderTab)}
          </div>
        ),
      )}
    </Section>
  );
}
