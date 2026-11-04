import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { send } from '@shared/messages';
import {
  getPRSyncState,
  getSettings,
  getToken,
  onPRSyncStateChanged,
  setToken,
  updateSettings,
} from '@shared/storage';
import { ACCENT_PRESETS, DEFAULT_SETTINGS, INITIAL_PR_SYNC_STATE, type PRSyncState, type Settings } from '@shared/types';

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

  useEffect(() => {
    void getSettings().then((s) => {
      setSettings(s);
      setApiBase(s.githubApiBase);
      setIntervalMin(s.syncIntervalMinutes);
    });
    void getToken().then((t) => setHasToken(!!t));
    void getPRSyncState().then(setSync);
    return onPRSyncStateChanged(setSync);
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty('--accent', settings.accentColor);
  }, [settings.accentColor]);

  const flash = () => setSaved(Date.now());

  const patch = async (p: Partial<Settings>) => {
    const next = await updateSettings(p);
    setSettings(next);
    flash();
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
      <h1>Engawa</h1>
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
            fine-grained トークンで、対象リポジトリの <b>Pull requests: Read</b> を付ける。
            <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">
              作成ページ
            </a>
            。保存先は端末内 (storage.local) のみ。
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
