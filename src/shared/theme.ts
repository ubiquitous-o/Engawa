import type { Settings } from './types';

/**
 * 設定を CSS 変数に落とす。サイドパネルと設定画面の両方で使う。
 * 実際の描画は shared/theme.css。
 */
export function applyTheme(settings: Settings, root: HTMLElement = document.documentElement): void {
  const t = settings.theme;
  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));
  root.style.setProperty('--accent', settings.accentColor);
  root.style.setProperty('--theme-c1', t.color1);
  root.style.setProperty('--theme-c2', t.mode === 'gradient' ? t.color2 : t.color1);
  root.style.setProperty('--theme-angle', `${clamp(t.angle, 0, 360)}deg`);
  root.style.setProperty('--theme-pct', `${clamp(t.intensity, 0, 100)}%`);
  // グレインは 100 でも目に痛くない程度に抑える
  root.style.setProperty('--grain-opacity', String((clamp(t.grain, 0, 100) / 100) * 0.5));
  root.dataset.themeMode = t.mode;
  root.dataset.density = settings.density;
}
