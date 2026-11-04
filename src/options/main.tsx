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
      out.push({ id: c.id, label: `${'　'.repeat(depth)}${c.title || '(無題)'}` });
      walk(c, depth + 1);
    }
  };
  walk(root, 0);
  return out;
}

function statusText(s: PRSyncState): string {
  switch (s.status) {
    case 'ok':
      return `正常。レビュー依頼 ${s.reviewCount} 件 / 自分のPR ${s.mineCount} 件`;
    case 'syncing':
      return '同期中…';
    case 'no_token':
      return 'トークン未設定';
    case 'unauthorized':
      return 'トークンが無効 (401)';
    case 'rate_limited':
      return `レート制限中（間隔 ${s.backoff} 倍）`;
    case 'error':
      return s.lastError ?? 'エラー';
    default:
      return '未同期';
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
    return onPRSyncStateChanged(setSync);
  }, []);

  // 設定画面自身にも同じテーマを当てるので、スライダーを動かすとその場で見える
  useEffect(() => applyTheme(settings), [settings]);

  const flash = () => setSaved(Date.now());

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
    const name = window.prompt('プリセットの名前', `カスタム ${n}`);
    if (name === null) return;
    const item: CustomTheme = { id: `${Date.now()}`, name: name.trim() || `カスタム ${n}`, theme: { ...theme } };
    void patch({ customThemes: [...settings.customThemes, item] });
  };
  const deleteCustomTheme = (c: CustomTheme) => {
    if (!window.confirm(`「${c.name}」を削除する？`)) return;
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
      setTest({ cls: 'error', text: `${base} へのアクセス権限が必要` });
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
    setTest({ cls: '', text: '確認中…' });
    const base = apiBase.trim().replace(/\/+$/, '') || DEFAULT_SETTINGS.githubApiBase;
    if (!(await ensureHostPermission(base))) {
      setTest({ cls: 'error', text: `${base} へのアクセス権限が必要` });
      return;
    }
    const r = await send({ type: 'github:test', token: tokenInput.trim() || undefined, apiBase: base });
    setTest(r.ok ? { cls: 'ok', text: `OK: ${r.login} として認証` } : { cls: 'error', text: r.error });
  };

  const isPreset = ACCENT_PRESETS.some((p) => p.value === settings.accentColor);

  return (
    <div class="page">
      <h1>
        <img class="logo" src="/icons/icon128.png" alt="" width={36} height={36} />
        Engawa
      </h1>
      <p class="lead">サイドパネルの設定。データはすべて Chrome のブックマークに置き、この拡張が独自に保存するのは設定とトークンだけ。</p>

      <div class="card">
        <h2>GitHub</h2>
        <div class="field">
          <label for="token">個人アクセストークン</label>
          <div class="inline">
            <input
              id="token"
              type="password"
              placeholder={hasToken ? '保存済み（変更するなら入力）' : 'github_pat_…'}
              value={tokenInput}
              onInput={(e) => setTokenInput((e.target as HTMLInputElement).value)}
              autocomplete="off"
            />
            {hasToken && <button onClick={clearToken}>削除</button>}
          </div>
          <div class="hint">
            関わる PR を全部拾うには、classic トークンでスコープ <b>repo</b> を付ける（リポジトリを選ばなくてよい）。
            <a href="https://github.com/settings/tokens/new" target="_blank" rel="noreferrer">
              作成ページ
            </a>
            。SSO の org は作成後に「Configure SSO」で認可。保存先は端末内 (storage.local) のみ。
          </div>
        </div>
        <div class="field">
          <label for="apibase">API ベース URL</label>
          <input id="apibase" type="url" value={apiBase} onInput={(e) => setApiBase((e.target as HTMLInputElement).value)} />
          <div class="hint">GitHub Enterprise なら https://ghe.example.com/api/v3</div>
        </div>
        <div class="field">
          <label for="interval">取得間隔（分）</label>
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
            保存
          </button>
          <button onClick={() => void runTest()}>接続テスト</button>
          <button onClick={() => void send({ type: 'pr:sync' })} disabled={!hasToken || sync.status === 'syncing'}>
            今すぐ同期
          </button>
        </div>
        {test && <div class={`status ${test.cls}`}>{test.text}</div>}
        <div class="status">
          <div class="sync-row">
            <span class="badge">{sync.status}</span>
            <span>{statusText(sync)}</span>
            {sync.lastSyncAt && <span>最終同期 {new Date(sync.lastSyncAt).toLocaleString('ja-JP')}</span>}
          </div>
        </div>
      </div>

      <div class="card">
        <h2>表示</h2>
        <Toggle label="PR セクションを表示" checked={settings.showPR} onChange={(v) => void patch({ showPR: v })} />
        <Toggle
          label="開いているタブを表示"
          hint="Chrome 標準の縦タブと重なるならオフに"
          checked={settings.showTabs}
          onChange={(v) => void patch({ showTabs: v })}
        />
        <Toggle
          label="コンパクト表示"
          hint="行とタイルを詰めて、狭い幅でも多く見せる"
          checked={settings.density === 'compact'}
          onChange={(v) => void patch({ density: v ? 'compact' : 'comfortable' })}
        />
        <Toggle
          label="新しいレビュー依頼を通知"
          checked={settings.notifyReviewRequests}
          onChange={(v) => void patch({ notifyReviewRequests: v })}
        />
        <div class="fav-size">
          <div>
            <div class="label">ブックマークに表示するフォルダ</div>
            <div class="hint">このフォルダの中身をブックマークセクションのトップに並べる。「すべて」ならブックマークバーなどのルートから</div>
          </div>
          <select class="folder-select" value={bookmarkRoot} onChange={(e) => void saveBookmarkRoot((e.target as HTMLSelectElement).value)} aria-label="ブックマークに表示するフォルダ">
            <option value="">すべて</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
        <div class="fav-size">
          <div>
            <div class="label">お気に入りのアイコンサイズ</div>
            <div class="hint">タイルの最小幅。幅に合わせて列数が変わる。コンパクト表示では 0.8 倍</div>
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
              aria-label="お気に入りのアイコンサイズ"
            />
            <span class="val">{settings.favTileSize}px</span>
            <span class="fav-preview" style={{ '--s': `${settings.favTileSize}px` } as Record<string, string>} aria-hidden="true">
              <span class="letter">E</span>
            </span>
          </div>
        </div>
      </div>

      <div class="card">
        <h2>アクセントカラー</h2>
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
          <label class={`swatch custom ${!isPreset ? 'selected' : ''}`} style={{ '--c': settings.accentColor } as Record<string, string>} title="カスタム">
            <input type="color" value={settings.accentColor} onChange={(e) => void patch({ accentColor: (e.target as HTMLInputElement).value })} />
          </label>
        </div>
      </div>

      <div class="card">
        <h2>背景</h2>
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
              <button class="theme-preset-del" title={`「${c.name}」を削除`} aria-label={`${c.name} を削除`} onClick={() => deleteCustomTheme(c)}>
                ×
              </button>
            </span>
          ))}
          <button class="theme-preset add" title="今の背景をプリセットとして保存" aria-label="プリセットを追加" onClick={saveCustomTheme}>
            +
          </button>
        </div>
        <div class="theme-row">
          <span>種類</span>
          <div class="seg">
            <button class={theme.mode === 'gradient' ? 'on' : ''} onClick={() => saveTheme({ mode: 'gradient' })}>
              グラデーション
            </button>
            <button class={theme.mode === 'solid' ? 'on' : ''} onClick={() => saveTheme({ mode: 'solid' })}>
              単色
            </button>
          </div>
          <span />
        </div>
        <div class="theme-row">
          <span>色</span>
          <div class="color-pair">
            <label>
              <input type="color" value={theme.color1} onInput={(e) => previewTheme({ color1: (e.target as HTMLInputElement).value })} onChange={(e) => saveTheme({ color1: (e.target as HTMLInputElement).value })} />
              {theme.mode === 'gradient' ? '始点' : '色'}
            </label>
            {theme.mode === 'gradient' && (
              <label>
                <input type="color" value={theme.color2} onInput={(e) => previewTheme({ color2: (e.target as HTMLInputElement).value })} onChange={(e) => saveTheme({ color2: (e.target as HTMLInputElement).value })} />
                終点
              </label>
            )}
          </div>
          <span />
        </div>
        {theme.mode === 'gradient' && (
          <div class="theme-row">
            <span>角度</span>
            <input type="range" min={0} max={360} step={5} value={theme.angle} onInput={(e) => previewTheme({ angle: Number((e.target as HTMLInputElement).value) })} onChange={(e) => saveTheme({ angle: Number((e.target as HTMLInputElement).value) })} />
            <span class="val">{theme.angle}°</span>
          </div>
        )}
        <div class="theme-row">
          <span>色の強さ</span>
          <input type="range" min={0} max={100} step={1} value={theme.intensity} onInput={(e) => previewTheme({ intensity: Number((e.target as HTMLInputElement).value) })} onChange={(e) => saveTheme({ intensity: Number((e.target as HTMLInputElement).value) })} />
          <span class="val">{theme.intensity}</span>
        </div>
        <div class="theme-row">
          <span>グレイン</span>
          <input type="range" min={0} max={100} step={1} value={theme.grain} onInput={(e) => previewTheme({ grain: Number((e.target as HTMLInputElement).value) })} onChange={(e) => saveTheme({ grain: Number((e.target as HTMLInputElement).value) })} />
          <span class="val">{theme.grain}</span>
        </div>
        <div class="inline" style="margin-top:4px">
          <button onClick={() => saveTheme(DEFAULT_THEME)}>既定に戻す</button>
          <span class="hint" style="font-size:12px;color:var(--fg-muted)">この画面の背景にもその場で反映される</span>
        </div>
      </div>

      <div class="card">
        <h2>キーボード</h2>
        <div class="hint" style="font-size:13px;color:var(--fg-muted);line-height:1.7">
          サイドパネルの開閉: <b>Alt+S</b>（
          <a href="#" onClick={(e) => { e.preventDefault(); void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }); }}>
            chrome://extensions/shortcuts
          </a>
          で変更）<br />
          パネル内: <b>/</b> 検索、<b>↑↓</b> 移動、<b>Enter</b> 開く、<b>←→</b> フォルダ開閉、<b>Esc</b> 検索解除
        </div>
      </div>

      {saved > 0 && <div class="saved" key={saved}>保存した</div>}
    </div>
  );
}

render(<Options />, document.getElementById('app')!);
