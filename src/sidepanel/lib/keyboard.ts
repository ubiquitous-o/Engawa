/**
 * ↑↓ で `[data-nav]` 要素間を移動、Enter で開く、`/` で検索、Esc で検索解除。
 * DOM 順に並んだ可視要素を対象にするので、セクションをまたいで動ける。
 */

function isEditable(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement).isContentEditable;
}

function navItems(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-nav]')).filter((el) => el.offsetParent !== null);
}

export function installKeyboard(opts: { searchInput: () => HTMLInputElement | null; clearSearch: () => void }): () => void {
  const onKey = (e: KeyboardEvent) => {
    const active = document.activeElement as HTMLElement | null;
    const search = opts.searchInput();
    const inSearch = active === search;

    if (e.key === '/' && !isEditable(active) && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      search?.focus();
      search?.select();
      return;
    }
    if (e.key === 'Escape') {
      if (inSearch) {
        e.preventDefault();
        opts.clearSearch();
        search?.blur();
      } else if (active && active.hasAttribute('data-nav')) {
        active.blur();
      }
      return;
    }
    if (isEditable(active) && !inSearch) return;

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const items = navItems();
      if (items.length === 0) return;
      e.preventDefault();
      if (inSearch) {
        if (e.key === 'ArrowDown') items[0]?.focus();
        return;
      }
      const idx = active ? items.indexOf(active) : -1;
      if (idx === -1) {
        (e.key === 'ArrowDown' ? items[0] : items[items.length - 1])?.focus();
        return;
      }
      const next = idx + (e.key === 'ArrowDown' ? 1 : -1);
      if (next < 0) {
        search?.focus();
        return;
      }
      items[Math.min(items.length - 1, next)]?.focus();
      return;
    }
    if (e.key === 'Enter' && active?.hasAttribute('data-nav') && active.tagName !== 'BUTTON' && active.tagName !== 'A') {
      e.preventDefault();
      active.click();
    }
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
