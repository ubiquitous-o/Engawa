/** URL 照合用の正規化。末尾スラッシュとフラグメントを無視し、ホストは小文字に。 */
export function normalizeUrl(input: string | undefined | null): string {
  if (!input) return '';
  try {
    const u = new URL(input);
    u.hash = '';
    u.hostname = u.hostname.toLowerCase();
    let s = u.toString();
    if (s.endsWith('/')) s = s.slice(0, -1);
    return s;
  } catch {
    return input;
  }
}

export function sameUrl(a: string | undefined | null, b: string | undefined | null): boolean {
  return normalizeUrl(a) === normalizeUrl(b);
}

/** 表示用のホスト名 */
export function hostOf(url: string | undefined): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Chrome の favicon キャッシュから取得する URL（favicon 権限が必要） */
export function faviconUrl(pageUrl: string | undefined, size = 32): string {
  const u = new URL(chrome.runtime.getURL('/_favicon/'));
  u.searchParams.set('pageUrl', pageUrl ?? '');
  u.searchParams.set('size', String(size));
  return u.toString();
}

export function isWebUrl(url: string | undefined): boolean {
  return !!url && /^https?:/i.test(url);
}
