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

  // 小窓の大きさを覚える。
  // Meet は開くたびに決まった（小さい）大きさを指定するので、開く命令を横取りして、
  // 最後に使っていた大きさに差し替える。大きさは利用者が変えるたびに Meet のページの localStorage に残す。
  // 手で開いたときも、Engawa が開いたときも同じように効く。
  // 位置はページからは指定できないので、拡張のバックグラウンド（src/background/pipWindow.ts）が受け持つ。
  // （ブラウザ自身の「前回の位置で開く」記憶に乗る方法も試したが、Vivaldi では効かなかった）
  const SIZE_KEY = 'engawa:pipSize';
  const readSize = () => {
    try {
      const v = JSON.parse(localStorage.getItem(SIZE_KEY) || 'null');
      return v && v.w >= 120 && v.h >= 120 && v.w <= 4000 && v.h <= 4000 ? v : null;
    } catch (_) {
      return null;
    }
  };
  try {
    const proto = DocumentPictureInPicture.prototype;
    const originalRequest = proto.requestWindow;
    proto.requestWindow = async function (options) {
      const opts = { ...(options || {}) };
      const size = readSize();
      if (size) {
        opts.width = size.w;
        opts.height = size.h;
        // これが付いていると、ブラウザは大きさと位置を毎回初期値に戻す
        delete opts.preferInitialWindowPlacement;
      }
      const win = await originalRequest.call(this, opts);
      win.addEventListener('resize', () => {
        try {
          if (win.innerWidth > 0 && win.innerHeight > 0) {
            localStorage.setItem(SIZE_KEY, JSON.stringify({ w: win.innerWidth, h: win.innerHeight }));
          }
        } catch (_) {
          // 保存できなくても小窓は開く
        }
      });
      return win;
    };
  } catch (_) {
    // Document Picture-in-Picture が無い環境では何もしない
  }

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
  // Meet の関数は隠れているときだけ小窓を開くので、隠れているように見せて呼ぶ。
  // Vivaldi 8.3 で確認: そのまま呼ぶと何も開かず、こうして呼ぶと Meet 本来の小窓（Document PiP）が開く。
  //
  // 小窓が開いたあとも、閉じるまで隠れたふりを続ける。
  // ふりを始めるときとやめるときには「見え方が変わった」という知らせ（visibilitychange）も送る。
  // 知らせを送らずに呼ぶと、複数人の会議で小窓は開くのに中身が 1 つも入らず、真っ白になった（Vivaldi 8.3 で確認）。
  let stopPretending = null;
  const pretendHidden = () => {
    if (stopPretending) return;
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
    stopPretending = () => {
      stopPretending = null;
      for (const undo of restore) undo();
      announceVisibility();
    };
    // Chrome が本当にタブを隠すときは、まず「見え方が変わった」という知らせが飛び、そのあと小窓の依頼が来る。
    // Meet は知らせを受けて自分の状態を切り替えているようなので、同じ順で知らせる
    announceVisibility();
  };
  const announceVisibility = () => {
    try {
      document.dispatchEvent(new Event('visibilitychange'));
    } catch (_) {
      // 知らせられなくても続ける
    }
  };
  const endPretend = () => {
    if (stopPretending) stopPretending();
  };

  // 順に試す。Engawa はこれを待たずにタブを切り替える。操作の権利は数秒しか残らないので手早く
  //  1. Meet の関数をそのまま呼ぶ
  //  2. 隠れているように見せて呼ぶ
  //  3. いちばん大きい映像 1 枚を小窓にする
  // Meet の画面のボタンを代わりに押す、という手は使わない（画面が変わると壊れるし、勝手に UI を操作したくない）
  //
  // 途中で close() が来たら（切り替えてすぐ Meet に戻ったとき）、そこで打ち切る。
  // 打ち切らないと、戻ったあとに小窓が開いたり、隠れたふりが残ったりする
  let cancelled = false;
  const abandon = () => {
    last += ' cancelled';
    endPretend();
    const w = docPip();
    if (w) w.close();
  };
  const attempt = async () => {
    if (handler) {
      await callHandler('now');
      const openedNow = await waitOpen(200);
      if (cancelled) return abandon();
      if (openedNow) {
        last += ' opened-by=now';
        return;
      }
      pretendHidden();
      await callHandler('pretend-hidden');
      await waitOpen(500);
      if (cancelled) return abandon();
      const w = docPip();
      if (w) {
        last += ' opened-by=pretend-hidden';
        // 小窓が閉じたら（自分で閉じた、Meet に戻って Engawa が閉じた）、ふりをやめる
        w.addEventListener('pagehide', endPretend);
        return;
      }
      endPretend();
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

  // キーボードでタブを切り替えるとき（Ctrl+Tab / Ctrl+Shift+Tab）。
  // このときは Engawa のパネルを通らないので、パネルからは小窓を開けない。
  // でも、キーを押したこと自体が「本物の操作」なので、キーがこのページに届くなら、ここで開ける。
  // ブラウザがキーをページに渡さずに自分で処理する場合は届かず、何も起きない（Chrome はそう）。
  let keyOpens = 0;
  let attempting = false;
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Tab' || !e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      keyOpens++;
      console.debug('[engawa] meet pip: Ctrl+Tab reached the page');
      window.__engawaPip.open();
    },
    true,
  );

  window.__engawaPip = {
    // すぐ戻る（'already' / 'started'）。結果は少し後で status() に聞く
    open() {
      // 小窓が無いのに隠れたふりが残っていたら、まず本当の状態に戻す（閉じた知らせが届かなかったときの保険）
      if (!attempting && stopPretending && !docPip()) endPretend();
      if (isOpen()) return 'already';
      // 前の試みがまだ途中なら、重ねて始めない（Ctrl+Tab を続けて押したとき、二度押ししたとき）
      if (attempting) return 'started';
      attempting = true;
      cancelled = false;
      activationAtOpen = navigator.userActivation ? String(navigator.userActivation.isActive) : 'unknown';
      last = 'steps:';
      void attempt().finally(() => {
        attempting = false;
      });
      return 'started';
    },
    status() {
      const videos = document.querySelectorAll('video').length;
      const nowActive = navigator.userActivation ? navigator.userActivation.isActive : 'unknown';
      const kind = docPip() ? 'document' : document.pictureInPictureElement ? 'video' : 'none';
      return `open=${isOpen()} kind=${kind} handler=${handler ? 'yes' : 'no'} activation=${activationAtOpen}/${nowActive} ${last} videos=${videos} hidden=${document.hidden} key-opens=${keyOpens}`;
    },
    close() {
      if (attempting) cancelled = true;
      endPretend();
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
