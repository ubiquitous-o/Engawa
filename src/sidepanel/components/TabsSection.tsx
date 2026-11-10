import { useCallback, useEffect, useState } from 'preact/hooks';
import { send } from '@shared/messages';
import { hostOf } from '@shared/url';
import { endDrag, startDrag } from '../lib/dnd';
import { openContextMenu } from '../lib/contextMenu';
import { addToFavoritesItems } from '../lib/favMenu';
import { useChromeEvents, type BookmarkNode } from '../lib/hooks';
import { getVivaldiTiles, onVivaldiTilesChanged, pruneVivaldiTiles, splitKeyOf, unsplitTab, type VivaldiTiles } from '../lib/split';
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
  favoritesFolders: BookmarkNode[];
  windowId: number | undefined;
  collapsed: boolean;
  onToggle: () => void;
}

type Block = { kind: 'tab'; tab: chrome.tabs.Tab } | { kind: 'group'; group: chrome.tabGroups.TabGroup; tabs: chrome.tabs.Tab[] };

export function TabsSection({ favoritesFolders, windowId, collapsed, onToggle }: Props) {
  const [tabs, setTabs] = useState<chrome.tabs.Tab[]>([]);
  const [groups, setGroups] = useState<Map<number, chrome.tabGroups.TabGroup>>(new Map());
  // お気に入りに対応しているタブ。Arc の固定タブと同じで、一覧には出さずタイルの印で表す
  const [favTabIds, setFavTabIds] = useState<Set<number>>(new Set());
  // 自分で作った Vivaldi のタイル（Vivaldi はタイル情報を拡張に見せないので、こちらで覚えている分）
  const [vivTiles, setVivTiles] = useState<VivaldiTiles>({});
  useEffect(() => {
    const load = () => void getVivaldiTiles().then(setVivTiles);
    load();
    return onVivaldiTilesChanged(load);
  }, []);


  const reload = useCallback(() => {
    if (windowId === undefined) return;
    void Promise.all([
      chrome.tabs.query({ windowId }),
      chrome.tabGroups.query({ windowId }),
      send({ type: 'fav:state' }).catch(() => ({})),
    ]).then(([t, g, fav]) => {
      setTabs(t.sort((a, b) => a.index - b.index));
      void pruneVivaldiTiles();
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
    const title = tab.title || hostOf(url) || 'New tab';
    const split = splitKeyOf(tab, vivTiles);
    return (
      <div
        key={tab.id}
        class={`row ${tab.active ? 'active-tab' : ''} ${split ? 'in-split' : ''}`}
        role="button"
        tabIndex={-1}
        data-nav
        title={`${title}\n${url}`}
        draggable
        onClick={() => activate(tab)}
        onAuxClick={(e) => {
          if (e.button === 1) close(tab);
        }}
        onDragStart={(e) => startDrag(e, { kind: 'tab', tabId: tab.id ?? -1, url, title })}
        onDragEnd={endDrag}
        onContextMenu={(e) =>
          openContextMenu(e, [
            ...addToFavoritesItems(favoritesFolders, { title, url }, !/^https?:/.test(url)),
            { label: tab.pinned ? 'Unpin' : 'Pin', onSelect: () => chrome.tabs.update(tab.id!, { pinned: !tab.pinned }) },
            { label: tab.mutedInfo?.muted ? 'Unmute' : 'Mute', onSelect: () => chrome.tabs.update(tab.id!, { muted: !tab.mutedInfo?.muted }) },
            { label: 'Reload', onSelect: () => chrome.tabs.reload(tab.id!) },
            { label: 'Duplicate', onSelect: () => chrome.tabs.duplicate(tab.id!) },
            ...(split ? [{ label: 'Unsplit', onSelect: () => unsplitTab(tab) }] : []),
            { separator: true },
            { label: 'Copy URL', disabled: !url, onSelect: () => navigator.clipboard.writeText(url) },
            { label: 'Close', danger: true, onSelect: () => close(tab) },
          ])
        }
      >
        {tab.pinned && <Pin class="pin" />}
        <Favicon url={url} src={tab.favIconUrl} />
        <span class="title">{title}</span>
        {tab.mutedInfo?.muted ? <Muted class="audio" /> : tab.audible ? <Audio class="audio" /> : null}
        <button
          class="hover-btn"
          title="Close"
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
    <Section title="Tabs" count={visible.length} collapsed={collapsed} onToggle={onToggle}>
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
              <span class="title">{b.group.title || 'Untitled group'}</span>
              <span class="count">{b.tabs.length}</span>
            </div>
            {!b.group.collapsed && b.tabs.map(renderTab)}
          </div>
        ),
      )}
    </Section>
  );
}
