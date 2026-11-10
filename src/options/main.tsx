import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { send } from '@shared/messages';
import {
  getBookmarkRootId,
  getPRSyncState,
  getSettings,
  getToken,
  onPRSyncStateChanged,
  setBookmarkRootId,
  setToken,
  updateSettings,
} from '@shared/storage';
import {
  connectSpotify,
  disconnectSpotify,
  getSpotifyClientId,
  isSpotifyConnected,
  setSpotifyClientId,
  spotifyRedirectUri,
} from '@shared/spotify';
import { applyTheme } from '@shared/theme';
import {
  ACCENT_PRESETS,
  DEFAULT_SETTINGS,
  DEFAULT_THEME,
  FAV_TILE_SIZE,
  INITIAL_PR_SYNC_STATE,
  THEME_PRESETS,
  type CustomTheme,
  type PRSyncState,
  type Settings,
  type Theme,
} from '@shared/types';

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <div class="toggle">
      <div>
        <div class="label">{label}</div>
        {hint && <div class="hint">{hint}</div>}
      </div>
      <button class="switch" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} aria-label={label} />
    </div>
  );
}

interface FolderOption {
  id: string;
  label: string;
}

/** ブックマークツリーのフォルダを、階層をインデントにして一列に並べる */
function flattenFolders(root: chrome.bookmarks.BookmarkTreeNode): FolderOption[] {
  const out: FolderOption[] = [];
  const walk = (n: chrome.bookmarks.BookmarkTreeNode, depth: number) => {
    for (const c of n.children ?? []) {
      if (c.url) continue;
      out.push({ id: c.id, label: `${'　'.repeat(depth)}${c.title || '(untitled)'}` });
      walk(c, depth + 1);
    }
  };
  walk(root, 0);
  return out;
}

function statusText(s: PRSyncState): string {
  switch (s.status) {
    case 'ok':
      return `OK. ${s.reviewCount} review requests / ${s.mineCount} of my pull requests`;
    case 'syncing':
      return 'Syncing…';
    case 'no_token':
      return 'No token set';
    case 'unauthorized':
      return 'Token is invalid (401)';
    case 'rate_limited':
      return `Rate limited (${s.backoff}× the interval)`;
    case 'error':
      return s.lastError ?? 'Error';
    default:
      return 'Not synced';
  }
}

function Options() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [hasToken, setHasToken] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [apiBase, setApiBase] = useState(DEFAULT_SETTINGS.githubApiBase);
  const [interval, setIntervalMin] = useState(DEFAULT_SETTINGS.syncIntervalMinutes);
  const [test, setTest] = useState<{ cls: string; text: string } | null>(null);
  const [sync, setSync] = useState<PRSyncState>(INITIAL_PR_SYNC_STATE);
  const [saved, setSaved] = useState(0);
  const [folders, setFolders] = useState<FolderOption[]>([]);
  const [bookmarkRoot, setBookmarkRoot] = useState<string>('');
  const [spotifyId, setSpotifyId] = useState('');
  const [spotifyOn, setSpotifyOn] = useState(false);
  const [spotifyMsg, setSpotifyMsg] = useState<{ cls: string; text: string } | null>(null);
  // 設定画面を拡張の外でプレビューするときは chrome.identity が無い
  const redirectUri = typeof chrome.identity?.getRedirectURL === 'function' ? spotifyRedirectUri() : '';

  useEffect(() => {
    void getSettings().then((s) => {
      setSettings(s);
      setApiBase(s.githubApiBase);
      setIntervalMin(s.syncIntervalMinutes);
    });
    void getToken().then((t) => setHasToken(!!t));
    void getPRSyncState().then(setSync);
    void chrome.bookmarks.getTree().then(([root]) => setFolders(root ? flattenFolders(root) : []));
    void getBookmarkRootId().then((id) => setBookmarkRoot(id ?? ''));
    void getSpotifyClientId().then(setSpotifyId);
    void isSpotifyConnected().then(setSpotifyOn);
    return onPRSyncStateChanged(setSync);
  }, []);

  // 設定画面自身にも同じテーマを当てるので、スライダーを動かすとその場で見える
  useEffect(() => applyTheme(settings), [settings]);

  const flash = () => setSaved(Date.now());

  const connectToSpotify = async () => {
    setSpotifyMsg({ cls: '', text: 'Waiting for Spotify…' });
    try {
      await setSpotifyClientId(spotifyId.trim());
      await connectSpotify();
      setSpotifyOn(true);
      setSpotifyMsg({ cls: 'ok', text: 'Connected' });
    } catch (e) {
      setSpotifyMsg({ cls: 'error', text: e instanceof Error ? e.message : 'Could not connect' });
    }
  };
  const disconnectFromSpotify = async () => {
    await disconnectSpotify();
    setSpotifyOn(false);
    setSpotifyMsg(null);
    flash();
  };

  const saveBookmarkRoot = async (id: string) => {
    setBookmarkRoot(id);
    await setBookmarkRootId(id || null);
    flash();
  };

  const patch = async (p: Partial<Settings>) => {
    const next = await updateSettings(p);
    setSettings(next);
    flash();
  };

  // スライダーは動かしている間はローカル state だけ更新し、離したら保存する
  const previewTheme = (p: Partial<Theme>) => setSettings((s) => ({ ...s, theme: { ...s.theme, ...p } }));
  const saveTheme = (p: Partial<Theme>) => void patch({ theme: { ...settings.theme, ...p } });
  const theme = settings.theme;
  const presetSelected = (c1: string, c2: string) =>
    theme.color1.toLowerCase() === c1 && (theme.mode === 'solid' || theme.color2.toLowerCase() === c2);

  // ---- 自分のプリセット ----
  const customSelected = (c: CustomTheme) =>
    (['mode', 'color1', 'color2', 'angle', 'intensity', 'grain'] as const).every((k) => c.theme[k] === theme[k]);
  const saveCustomTheme = () => {
    const n = settings.customThemes.length + 1;
    const name = window.prompt('Preset name', `Custom ${n}`);
    if (name === null) return;
    const item: CustomTheme = { id: `${Date.now()}`, name: name.trim() || `Custom ${n}`, theme: { ...theme } };
    void patch({ customThemes: [...settings.customThemes, item] });
  };
  const deleteCustomTheme = (c: CustomTheme) => {
    if (!window.confirm(`Delete "${c.name}"?`)) return;
    void patch({ customThemes: settings.customThemes.filter((x) => x.id !== c.id) });
  };

  /** GitHub.com 以外の API を使うときはそのホストの権限を要求する */
  const ensureHostPermission = async (base: string): Promise<boolean> => {
    let origin: string;
    try {
      origin = `${new URL(base).origin}/*`;
    } catch {
      return false;
    }
    if (origin === 'https://api.github.com/*') return true;
    if (await chrome.permissions.contains({ origins: [origin] })) return true;
    return chrome.permissions.request({ origins: [origin] });
  };

  const saveGitHub = async () => {
    const base = apiBase.trim().replace(/\/+$/, '') || DEFAULT_SETTINGS.githubApiBase;
    if (!(await ensureHostPermission(base))) {
      setTest({ cls: 'error', text: `Permission to access ${base} is required` });
      return;
    }
    await patch({ githubApiBase: base, syncIntervalMinutes: Math.max(1, Math.round(interval) || 5) });
    if (tokenInput.trim()) {
      await setToken(tokenInput.trim());
      setTokenInput('');
      setHasToken(true);
    }
    setTest(null);
  };

  const clearToken = async () => {
    await setToken(null);
    setHasToken(false);
    setTokenInput('');
    flash();
  };

  const runTest = async () => {
    setTest({ cls: '', text: 'Checking…' });
    const base = apiBase.trim().replace(/\/+$/, '') || DEFAULT_SETTINGS.githubApiBase;
    if (!(await ensureHostPermission(base))) {
      setTest({ cls: 'error', text: `Permission to access ${base} is required` });
      return;
    }
    const r = await send({ type: 'github:test', token: tokenInput.trim() || undefined, apiBase: base });
    setTest(r.ok ? { cls: 'ok', text: `OK: authenticated as ${r.login}` } : { cls: 'error', text: r.error });
  };

  const isPreset = ACCENT_PRESETS.some((p) => p.value === settings.accentColor);

  return (
    <div class="page">
      <h1>
        <img class="logo" src="/icons/icon128.png" alt="" width={36} height={36} />
        Engawa
      </h1>
      <p class="lead">Side panel settings. All data lives in Chrome bookmarks; the only things this extension stores itself are settings and the token.</p>

      <div class="card">
        <h2>GitHub</h2>
        <div class="field">
          <label for="token">Personal access token</label>
          <div class="inline">
            <input
              id="token"
              type="password"
              placeholder={hasToken ? 'Saved (type to replace)' : 'github_pat_…'}
              value={tokenInput}
              onInput={(e) => setTokenInput((e.target as HTMLInputElement).value)}
              autocomplete="off"
            />
            {hasToken && <button onClick={clearToken}>Remove</button>}
          </div>
          <div class="hint">
            To catch every PR you are involved in, use a classic token with the <b>repo</b> scope (no need to pick repositories).{' '}
            <a href="https://github.com/settings/tokens/new" target="_blank" rel="noreferrer">
              Create one here
            </a>
            . For orgs with SSO, authorize it via "Configure SSO" after creating it. Stored on this device only (storage.local).
          </div>
        </div>
        <div class="field">
          <label for="apibase">API base URL</label>
          <input id="apibase" type="url" value={apiBase} onInput={(e) => setApiBase((e.target as HTMLInputElement).value)} />
          <div class="hint">For GitHub Enterprise: https://ghe.example.com/api/v3</div>
        </div>
        <div class="field">
          <label for="interval">Sync interval (minutes)</label>
          <input
            id="interval"
            type="number"
            min={1}
            max={120}
            value={interval}
            onInput={(e) => setIntervalMin(Number((e.target as HTMLInputElement).value))}
            style="width:120px"
          />
        </div>
        <div class="inline">
          <button class="primary" onClick={() => void saveGitHub()}>
            Save
          </button>
          <button onClick={() => void runTest()}>Test connection</button>
          <button onClick={() => void send({ type: 'pr:sync' })} disabled={!hasToken || sync.status === 'syncing'}>
            Sync now
          </button>
        </div>
        {test && <div class={`status ${test.cls}`}>{test.text}</div>}
        <div class="status">
          <div class="sync-row">
            <span class="badge">{sync.status}</span>
            <span>{statusText(sync)}</span>
            {sync.lastSyncAt && <span>Last sync {new Date(sync.lastSyncAt).toLocaleString()}</span>}
          </div>
        </div>
      </div>

      <div class="card">
        <h2>Spotify</h2>
        <div class="field">
          <label for="spotify-id">Client ID</label>
          <input
            id="spotify-id"
            type="text"
            placeholder="Client ID of your own Spotify app"
            value={spotifyId}
            onInput={(e) => setSpotifyId((e.target as HTMLInputElement).value)}
            autocomplete="off"
            spellcheck={false}
          />
          <div class="hint">
            Shows what is playing on your Spotify account at the bottom of the panel, on any device. Create an app at{' '}
            <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">
              developer.spotify.com
            </a>{' '}
            (Web API) and add the redirect URI below to it. No client secret is used. Tokens stay on this device (storage.local).
          </div>
        </div>
        <div class="field">
          <label for="spotify-redirect">Redirect URI to register</label>
          <div class="inline">
            <input id="spotify-redirect" type="text" readOnly value={redirectUri} onFocus={(e) => (e.target as HTMLInputElement).select()} />
            <button onClick={() => void navigator.clipboard.writeText(redirectUri).then(flash)}>Copy</button>
          </div>
        </div>
        <div class="inline">
          <button class="primary" onClick={() => void connectToSpotify()} disabled={!spotifyId.trim()}>
            {spotifyOn ? 'Reconnect' : 'Connect'}
          </button>
          {spotifyOn && <button onClick={() => void disconnectFromSpotify()}>Disconnect</button>}
          <span class="hint" style="font-size:12px;color:var(--fg-muted)">{spotifyOn ? 'Connected' : 'Not connected'}</span>
        </div>
        {spotifyMsg && <div class={`status ${spotifyMsg.cls}`}>{spotifyMsg.text}</div>}
        <Toggle
          label="Show now playing"
          hint="Slit-scans the album art below the tabs, with playback buttons at the bottom"
          checked={settings.showNowPlaying}
          onChange={(v) => void patch({ showNowPlaying: v })}
        />
        <div class="theme-row" style="margin-top:10px">
          <span>Artwork strength</span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={settings.nowPlayingOpacity}
            onInput={(e) => setSettings((s) => ({ ...s, nowPlayingOpacity: Number((e.target as HTMLInputElement).value) }))}
            onChange={(e) => void patch({ nowPlayingOpacity: Number((e.target as HTMLInputElement).value) })}
            aria-label="Artwork strength"
          />
          <span class="val">{settings.nowPlayingOpacity}</span>
        </div>
      </div>

      <div class="card">
        <h2>Display</h2>
        <Toggle label="Show pull requests section" checked={settings.showPR} onChange={(v) => void patch({ showPR: v })} />
        <Toggle
          label="Show open tabs"
          hint="Turn off if it overlaps with Chrome's own vertical tabs"
          checked={settings.showTabs}
          onChange={(v) => void patch({ showTabs: v })}
        />
        <Toggle
          label="Compact mode"
          hint="Tighter rows and tiles to fit more in a narrow panel"
          checked={settings.density === 'compact'}
          onChange={(v) => void patch({ density: v ? 'compact' : 'comfortable' })}
        />
        <Toggle
          label="Notify on new review requests"
          checked={settings.notifyReviewRequests}
          onChange={(v) => void patch({ notifyReviewRequests: v })}
        />
        <div class="fav-size">
          <div>
            <div class="label">Folder shown in Bookmarks</div>
            <div class="hint">Lists this folder's contents at the top of the Bookmarks section. "All" starts from the roots (bookmarks bar, etc.)</div>
          </div>
          <select class="folder-select" value={bookmarkRoot} onChange={(e) => void saveBookmarkRoot((e.target as HTMLSelectElement).value)} aria-label="Folder shown in Bookmarks">
            <option value="">All</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
        <div class="fav-size">
          <div>
            <div class="label">Favorites icon size</div>
            <div class="hint">Minimum tile width. The number of columns follows the panel width. Compact mode uses 0.8×</div>
          </div>
          <div class="fav-size-row">
            <input
              type="range"
              min={FAV_TILE_SIZE.min}
              max={FAV_TILE_SIZE.max}
              step={FAV_TILE_SIZE.step}
              value={settings.favTileSize}
              onInput={(e) => setSettings((s) => ({ ...s, favTileSize: Number((e.target as HTMLInputElement).value) }))}
              onChange={(e) => void patch({ favTileSize: Number((e.target as HTMLInputElement).value) })}
              aria-label="Favorites icon size"
            />
            <span class="val">{settings.favTileSize}px</span>
            <span class="fav-preview" style={{ '--s': `${settings.favTileSize}px` } as Record<string, string>} aria-hidden="true">
              <span class="letter">E</span>
            </span>
          </div>
        </div>
      </div>

      <div class="card">
        <h2>Accent color</h2>
        <div class="swatches">
          {ACCENT_PRESETS.map((p) => (
            <button
              key={p.value}
              class={`swatch ${settings.accentColor === p.value ? 'selected' : ''}`}
              style={{ '--c': p.value } as Record<string, string>}
              title={p.name}
              aria-label={p.name}
              onClick={() => void patch({ accentColor: p.value })}
            />
          ))}
          <label class={`swatch custom ${!isPreset ? 'selected' : ''}`} style={{ '--c': settings.accentColor } as Record<string, string>} title="Custom">
            <input type="color" value={settings.accentColor} onChange={(e) => void patch({ accentColor: (e.target as HTMLInputElement).value })} />
          </label>
        </div>
      </div>

      <div class="card">
        <h2>Background</h2>
        <div class="theme-presets">
          {THEME_PRESETS.map((p) => (
            <button
              key={p.name}
              class={`theme-preset ${presetSelected(p.color1, p.color2) ? 'selected' : ''}`}
              style={{ '--c1': p.color1, '--c2': p.color2 } as Record<string, string>}
              title={p.name}
              aria-label={p.name}
              onClick={() => saveTheme({ mode: 'gradient', color1: p.color1, color2: p.color2 })}
            />
          ))}
          {settings.customThemes.map((c) => (
            <span key={c.id} class={`theme-preset-wrap ${customSelected(c) ? 'selected' : ''}`}>
              <button
                class="theme-preset"
                style={{ '--c1': c.theme.color1, '--c2': c.theme.mode === 'gradient' ? c.theme.color2 : c.theme.color1, '--a': `${c.theme.angle}deg` } as Record<string, string>}
                title={c.name}
                aria-label={c.name}
                onClick={() => saveTheme(c.theme)}
              />
              <button class="theme-preset-del" title={`Delete "${c.name}"`} aria-label={`Delete ${c.name}`} onClick={() => deleteCustomTheme(c)}>
                ×
              </button>
            </span>
          ))}
          <button class="theme-preset add" title="Save the current background as a preset" aria-label="Add preset" onClick={saveCustomTheme}>
            +
          </button>
        </div>
        <div class="theme-row">
          <span>Type</span>
          <div class="seg">
            <button class={theme.mode === 'gradient' ? 'on' : ''} onClick={() => saveTheme({ mode: 'gradient' })}>
              Gradient
            </button>
            <button class={theme.mode === 'solid' ? 'on' : ''} onClick={() => saveTheme({ mode: 'solid' })}>
              Solid
            </button>
          </div>
          <span />
        </div>
        <div class="theme-row">
          <span>Colors</span>
          <div class="color-pair">
            <label>
              <input type="color" value={theme.color1} onInput={(e) => previewTheme({ color1: (e.target as HTMLInputElement).value })} onChange={(e) => saveTheme({ color1: (e.target as HTMLInputElement).value })} />
              {theme.mode === 'gradient' ? 'Start' : 'Color'}
            </label>
            {theme.mode === 'gradient' && (
              <label>
                <input type="color" value={theme.color2} onInput={(e) => previewTheme({ color2: (e.target as HTMLInputElement).value })} onChange={(e) => saveTheme({ color2: (e.target as HTMLInputElement).value })} />
                End
              </label>
            )}
          </div>
          <span />
        </div>
        {theme.mode === 'gradient' && (
          <div class="theme-row">
            <span>Angle</span>
            <input type="range" min={0} max={360} step={5} value={theme.angle} onInput={(e) => previewTheme({ angle: Number((e.target as HTMLInputElement).value) })} onChange={(e) => saveTheme({ angle: Number((e.target as HTMLInputElement).value) })} />
            <span class="val">{theme.angle}°</span>
          </div>
        )}
        <div class="theme-row">
          <span>Intensity</span>
          <input type="range" min={0} max={100} step={1} value={theme.intensity} onInput={(e) => previewTheme({ intensity: Number((e.target as HTMLInputElement).value) })} onChange={(e) => saveTheme({ intensity: Number((e.target as HTMLInputElement).value) })} />
          <span class="val">{theme.intensity}</span>
        </div>
        <div class="theme-row">
          <span>Grain</span>
          <input type="range" min={0} max={100} step={1} value={theme.grain} onInput={(e) => previewTheme({ grain: Number((e.target as HTMLInputElement).value) })} onChange={(e) => saveTheme({ grain: Number((e.target as HTMLInputElement).value) })} />
          <span class="val">{theme.grain}</span>
        </div>
        <div class="inline" style="margin-top:4px">
          <button onClick={() => saveTheme(DEFAULT_THEME)}>Reset to default</button>
          <span class="hint" style="font-size:12px;color:var(--fg-muted)">This page's background updates live too</span>
        </div>
      </div>

      <div class="card">
        <h2>Keyboard</h2>
        <div class="hint" style="font-size:13px;color:var(--fg-muted);line-height:1.7">
          Toggle the side panel: <b>Alt+S</b> (change it at{' '}
          <a href="#" onClick={(e) => { e.preventDefault(); void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }); }}>
            chrome://extensions/shortcuts
          </a>
          )<br />
          In the panel: <b>/</b> search, <b>↑↓</b> move, <b>Enter</b> open, <b>←→</b> expand/collapse folder, <b>Esc</b> clear search
        </div>
      </div>

      {saved > 0 && <div class="saved" key={saved}>Saved</div>}
    </div>
  );
}

render(<Options />, document.getElementById('app')!);
