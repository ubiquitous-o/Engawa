import { respond, respondError, type Request, type ResponseMap } from '@shared/messages';
import { getSettings, getToken, onSettingsChanged, onTokenChanged } from '@shared/storage';
import { closeMeetPip, isMeetUrl } from '@shared/pip';
import * as favorites from './favorites';
import { ALARM_NAME, registerGitHubListeners, scheduleAlarm, syncPRs, testToken } from './github';

// ---- 起動時の初期化 ----

async function bootstrap(): Promise<void> {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  await favorites.reconcile();
  await syncPRs();
}

chrome.runtime.onInstalled.addListener(() => {
  void bootstrap();
});

chrome.runtime.onStartup.addListener(() => {
  void bootstrap();
});

// ---- Meet のタブに戻ったら小窓を閉じる（Chrome の自動 Picture-in-Picture と同じ動き） ----

chrome.tabs.onActivated.addListener(({ tabId }) => {
  void chrome.tabs
    .get(tabId)
    .then((tab) => (isMeetUrl(tab.url) ? closeMeetPip(tabId) : undefined))
    .catch(() => undefined);
});

// ---- アラーム ----

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) void syncPRs();
});

// ---- 設定・トークン変更 ----

onSettingsChanged(() => {
  void (async () => {
    await scheduleAlarm();
    const settings = await getSettings();
    await chrome.action.setBadgeBackgroundColor({ color: settings.accentColor });
  })();
});

onTokenChanged(() => {
  void syncPRs();
});

// ---- メッセージ ----

async function handle<R extends Request>(req: R): Promise<ResponseMap[R['type']]> {
  switch (req.type) {
    case 'fav:state':
      return (await favorites.getState()) as ResponseMap[R['type']];
    case 'fav:open':
      return { tabId: await favorites.open(req.bookmarkId, req.windowId) } as ResponseMap[R['type']];
    case 'fav:restore':
      return { ok: await favorites.restore(req.bookmarkId) } as ResponseMap[R['type']];
    case 'fav:closeTab':
      return { ok: await favorites.closeTab(req.bookmarkId) } as ResponseMap[R['type']];
    case 'pr:sync':
      return (await syncPRs()) as ResponseMap[R['type']];
    case 'github:test': {
      const token = req.token ?? (await getToken());
      const apiBase = req.apiBase ?? (await getSettings()).githubApiBase;
      return (await testToken(token, apiBase)) as ResponseMap[R['type']];
    }
  }
}

chrome.runtime.onMessage.addListener((msg: Request, _sender, sendResponse) => {
  handle(msg)
    .then((data) => sendResponse(respond(data)))
    .catch((e: unknown) => sendResponse(respondError(e)));
  return true;
});

favorites.registerFavoriteListeners();
registerGitHubListeners();

// Service Worker が再起動したときもアラームを保証する
void chrome.alarms.get(ALARM_NAME).then((a) => {
  if (!a) void scheduleAlarm();
});
