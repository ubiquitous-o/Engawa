import { useState } from 'preact/hooks';
import { faviconUrl, hostOf } from '@shared/url';
import { Folder } from './Icons';

interface Props {
  url?: string;
  /** タブが持っている favicon URL（あれば優先） */
  src?: string;
  size?: number;
  class?: string;
}

/** favicon。取れないときは頭文字のタイルにフォールバックする。 */
export function Favicon({ url, src, size = 16, class: cls = '' }: Props) {
  const [failed, setFailed] = useState(false);
  if (!url) return <Folder class={`fav folder ${cls}`} />;
  const letter = (hostOf(url)[0] ?? '•').toUpperCase();
  if (failed) {
    return (
      <span class={`fav letter ${cls}`} style={{ width: size, height: size, fontSize: Math.max(9, size * 0.5) }}>
        {letter}
      </span>
    );
  }
  const usable = src && !src.startsWith('chrome://') ? src : faviconUrl(url, size >= 20 ? 32 : 16);
  return (
    <img
      class={`fav ${cls}`}
      src={usable}
      width={size}
      height={size}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
