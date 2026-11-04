import type { RefObject } from 'preact';
import { Close, Search } from './Icons';

interface Props {
  value: string;
  onChange: (v: string) => void;
  inputRef: RefObject<HTMLInputElement>;
}

export function SearchBox({ value, onChange, inputRef }: Props) {
  return (
    <div class="search">
      <div class="search-box">
        <Search />
        <input
          ref={inputRef}
          type="search"
          placeholder="ブックマークを検索"
          value={value}
          onInput={(e) => onChange((e.target as HTMLInputElement).value)}
          spellcheck={false}
          autocomplete="off"
        />
        {value ? (
          <button class="clear" onClick={() => { onChange(''); inputRef.current?.focus(); }} title="クリア (Esc)">
            <Close style="width:12px;height:12px" />
          </button>
        ) : (
          <span class="kbd">/</span>
        )}
      </div>
    </div>
  );
}
