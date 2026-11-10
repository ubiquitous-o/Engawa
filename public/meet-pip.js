// Google Meet のページ本体（MAIN world）で document_start に動く。
//
// Chrome は Meet のタブから離れると自動で小窓（Picture-in-Picture）を出すが、Vivaldi ではその合図が届かない。
// Meet は「小窓を開いて」という依頼を受け取る関数を mediaSession に登録しているので、それを控えておき、
// Engawa がタブを切り替える直前に呼べるようにする。呼ぶ側は src/sidepanel/lib/pip.ts。
(() => {
  if (window.__engawaPip) return;
  let handler = null;
  try {
    const proto = MediaSession.prototype;
    const original = proto.setActionHandler;
    proto.setActionHandler = function (action, fn) {
      if (action === 'enterpictureinpicture') handler = fn;
      return original.call(this, action, fn);
    };
  } catch (_) {
    // mediaSession が無い環境では何もしない
  }

  const docPip = () => (window.documentPictureInPicture ? window.documentPictureInPicture.window : null);

  // Meet が依頼を受け付けていないときの代わり: いちばん大きく映っている映像 1 枚を小窓にする
  const biggestVideo = () => {
    let best = null;
    let bestArea = 0;
    for (const v of document.querySelectorAll('video')) {
      const r = v.getBoundingClientRect();
      const area = r.width * r.height;
      if (v.readyState >= 2 && area > bestArea) {
        best = v;
        bestArea = area;
      }
    }
    if (best) best.disablePictureInPicture = false; // Meet は映像に「小窓禁止」を付けているので外す
    return best;
  };

  const isOpen = () => !!(docPip() || document.pictureInPictureElement);
  const message = (e) => (e && e.message ? e.message : String(e));
  // 直近の open() の経過。status() で Engawa に返す
  let last = 'idle';
  let activationAtOpen = 'unknown';

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitOpen = async (ms) => {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      if (isOpen()) return true;
      await sleep(50);
    }
    return isOpen();
  };
  const callHandler = async (label) => {
    try {
      await handler({ action: 'enterpictureinpicture' });
      last += ` ${label}=resolved`;
    } catch (e) {
      last += ` ${label}=error:${message(e)}`;
    }
  };

  // Vivaldi は裏に回ったタブを「隠れた」ことにしない（document.hidden が false のまま）。
  // Meet の関数は隠れているときだけ小窓を開くので、呼ぶあいだだけ隠れているように見せる。
  // Vivaldi 8.3 で確認: そのまま呼ぶと何も開かず、こうして呼ぶと Meet 本来の小窓（Document PiP）が開く
  const withHiddenPretended = async (fn) => {
    const restore = [];
    const pretend = (obj, key, value) => {
      try {
        Object.defineProperty(obj, key, { configurable: true, get: () => value });
        restore.push(() => delete obj[key]);
      } catch (_) {
        // 上書きできなければそのまま
      }
    };
    pretend(document, 'hidden', true);
    pretend(document, 'visibilityState', 'hidden');
    try {
      await fn();
    } finally {
      for (const undo of restore) undo();
    }
  };

  // 順に試す。Engawa はこれを待たずにタブを切り替える。操作の権利は数秒しか残らないので手早く
  //  1. Meet の関数をそのまま呼ぶ
  //  2. 隠れているように見せて呼ぶ
  //  3. いちばん大きい映像 1 枚を小窓にする
  // Meet の画面のボタンを代わりに押す、という手は使わない（画面が変わると壊れるし、勝手に UI を操作したくない）
  const attempt = async () => {
    if (handler) {
      await callHandler('now');
      if (await waitOpen(200)) {
        last += ' opened-by=now';
        return;
      }
      await withHiddenPretended(async () => {
        await callHandler('pretend-hidden');
        await waitOpen(500);
      });
      if (isOpen()) {
        last += ' opened-by=pretend-hidden';
        return;
      }
    }
    const video = biggestVideo();
    if (!video) {
      last += ' no-video';
      return;
    }
    last += ' video=pending';
    try {
      await video.requestPictureInPicture();
      last += ' video=resolved opened-by=video';
    } catch (e) {
      last += ` video=error:${message(e)}`;
    }
  };

  window.__engawaPip = {
    // すぐ戻る（'already' / 'started'）。結果は少し後で status() に聞く
    open() {
      if (isOpen()) return 'already';
      activationAtOpen = navigator.userActivation ? String(navigator.userActivation.isActive) : 'unknown';
      last = 'steps:';
      void attempt();
      return 'started';
    },
    status() {
      const videos = document.querySelectorAll('video').length;
      const nowActive = navigator.userActivation ? navigator.userActivation.isActive : 'unknown';
      const kind = docPip() ? 'document' : document.pictureInPictureElement ? 'video' : 'none';
      return `open=${isOpen()} kind=${kind} handler=${handler ? 'yes' : 'no'} activation=${activationAtOpen}/${nowActive} ${last} videos=${videos} hidden=${document.hidden}`;
    },
    close() {
      const w = docPip();
      if (w) {
        w.close();
        return 'closed';
      }
      if (document.pictureInPictureElement) {
        void document.exitPictureInPicture();
        return 'closed';
      }
      return 'none';
    },
  };
})();
