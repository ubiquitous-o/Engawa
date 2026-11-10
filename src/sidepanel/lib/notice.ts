/** パネル上部に一言出すための合図。App が受け取って表示する。 */
export const NOTICE_EVENT = 'engawa:notice';

export function notice(text: string): void {
  window.dispatchEvent(new CustomEvent(NOTICE_EVENT, { detail: text }));
}

/** ブックマークのセクション見出しの「＋」から、一番上の階層にフォルダを作る合図。BookmarkTree が受け取る。 */
export const NEW_FOLDER_EVENT = 'engawa:new-folder';
