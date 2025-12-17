(() => {
  if (window.__TM_EXT_LOADED__) return; 
  window.__TM_EXT_LOADED__ = true;
  function getApiBase() {
    try {
      const v = window?.process?.env?.REACT_APP_API_URL || 'http://localhost:8000/api';
      return v;
    } catch {
      return 'http://localhost:8000/api';
    }
  }

  window.addEventListener('message', (event) => {
    const data = event?.data || {};
    if (data.type === 'TM_SET_TRACK_TASK') {
      chrome.runtime.sendMessage({
        type: 'TM_SET_TRACK_TASK',
        taskId: data.taskId,
        token: data.token,
        apiBase: data.apiBase || getApiBase(),
      });
    } else if (data.type === 'TM_STOP_TRACK_TASK') {
      chrome.runtime.sendMessage({ type: 'TM_STOP_TRACK_TASK' });
    }
  });

  const sendInteraction = (payload) => {
    try {
      chrome.runtime.sendMessage({ type: 'TM_INTERACTION', ...payload });
    } catch {}
  };

  let aggKeys = 0;
  let aggMouse = 0;
  let flushTimer = null;
  const flush = () => {
    if (aggKeys > 0 || aggMouse > 0) {
      sendInteraction({ keyboard: aggKeys, mouse: aggMouse });
      aggKeys = 0; aggMouse = 0;
    }
  };
  const scheduleFlush = () => {
    if (flushTimer) return;
    flushTimer = setTimeout(() => { flush(); flushTimer = null; }, 500);
  };
  const onMouse = () => { aggMouse += 1; scheduleFlush(); };
  const onKey = () => { aggKeys += 1; scheduleFlush(); };
  const onInput = (e) => {
    try {
      const typ = e.inputType || '';
      if (e.isComposing || typ === 'insertCompositionText' || typ.startsWith('insert')) {
        aggKeys += 1; scheduleFlush();
      }
    } catch {
      aggKeys += 1; scheduleFlush();
    }
  };
  const onCompositionEnd = () => { aggKeys += 1; scheduleFlush(); };
  // Capture phase to avoid page-level stopPropagation
  document.addEventListener('click', onMouse, true);
  window.addEventListener('click', onMouse, true);
  document.addEventListener('mousedown', onMouse, true);
  document.addEventListener('mouseup', onMouse, true);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('keydown', onKey, true);
  document.addEventListener('keyup', onKey, true);
  document.addEventListener('keypress', onKey, true);
  document.addEventListener('input', onInput, true);
  document.addEventListener('compositionend', onCompositionEnd, true);
  window.addEventListener('beforeunload', () => { try { flush(); } catch {} });
})();
