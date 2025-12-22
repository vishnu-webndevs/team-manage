let currentTaskId = null;
let bearerToken = null;
let apiBase = 'http://localhost:8000/api';

let session = {
  start: null,
  url: null,
  title: null,
  keyboard: 0,
  mouse: 0,
};

const postSession = async (endTs) => {
  try {
    if (!session.start || !session.url || !currentTaskId) return;
    const startTs = session.start;
    const durationSeconds = Math.max(0, Math.round((endTs - startTs) / 1000));
    if (durationSeconds === 0) return;
    const payload = {
      task_id: currentTaskId,
      app_name: 'browser',
      window_title: session.title || '',
      url: session.url || '',
      start_time: new Date(startTs).toISOString(),
      end_time: new Date(endTs).toISOString(),
      duration_seconds: durationSeconds,
      keyboard_clicks: session.keyboard || 0,
      mouse_clicks: session.mouse || 0,
    };
    const headers = { 'Content-Type': 'application/json' };
    if (bearerToken) headers['Authorization'] = `Bearer ${bearerToken}`;
    await fetch(`${apiBase.replace(/\/+$/, '')}/activity-sessions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
  //  console.log('[TM] session posted', payload);
  } catch (e) {
  //  console.log('[TM] post session failed', e);
  }
};

const startNewSession = async (tab) => {
  try {
    const endTs = Date.now();
    await postSession(endTs);
  } catch {}
  session.start = Date.now();
  session.url = tab?.url || '';
  session.title = tab?.title || '';
  session.keyboard = 0;
  session.mouse = 0;
//  console.log('[TM] new session', session);
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'TM_SET_TRACK_TASK') {
    currentTaskId = msg.taskId || null;
    bearerToken = msg.token || null;
    apiBase = msg.apiBase || apiBase;
    sendResponse({ ok: true });
    try {
      chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        const tab = tabs && tabs[0];
        if (tab) startNewSession(tab);
      });
      // Ensure content script is injected into existing tabs so interactions are captured without reload
      chrome.tabs.query({}, (tabs) => {
        (tabs || []).forEach((t) => {
          try {
            if (!t.id || t.url?.startsWith('chrome://') || t.url?.startsWith('edge://')) return;
            chrome.scripting.executeScript({
              target: { tabId: t.id, allFrames: true },
              files: ['content.js'],
            });
          } catch (e) {
          //  console.log('[TM] inject failed', e?.message || e);
          }
        });
      });
    } catch {}
    return true;
  }
  if (msg?.type === 'TM_STOP_TRACK_TASK') {
    currentTaskId = null;
    sendResponse({ ok: true });
    return true;
  }
  if (msg?.type === 'TM_INTERACTION') {
    if (!currentTaskId) {
      sendResponse?.({ ok: false });
      return true;
    }
    if (msg.keyboard) session.keyboard += msg.keyboard;
    if (msg.mouse) session.mouse += msg.mouse;
    sendResponse?.({ ok: true });
    return true;
  }
});

const refreshActiveTab = (tabId) => {
  chrome.tabs.get(tabId, (tab) => {
    startNewSession(tab);
  });
};

chrome.tabs.onActivated.addListener((activeInfo) => {
  refreshActiveTab(activeInfo.tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' || changeInfo.url) {
    startNewSession(tab);
  }
});

chrome.windows.onFocusChanged.addListener(async (winId) => {
  if (winId === chrome.windows.WINDOW_ID_NONE) {
    // Lost focus: close session
    await postSession(Date.now());
    session.start = null;
    session.url = null;
    session.title = null;
    session.keyboard = 0;
    session.mouse = 0;
  } else {
    chrome.tabs.query({ active: true, windowId: winId }, (tabs) => {
      const tab = tabs && tabs[0];
      if (tab) startNewSession(tab);
    });
  }
});

chrome.idle.onStateChanged.addListener(async (state) => {
  if (state !== 'active') {
    await postSession(Date.now());
  } else {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      if (tab) startNewSession(tab);
    });
  }
});
