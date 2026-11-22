// Preload Script — Jembatan Native di dalam Desktop .EXE (Pengganti Ekstensi Browser)
// Otomatis menangkap postMessage 'GAS_WEBAPP_PAGE' dari halaman Vercel PWA dan meneruskannya ke Main Process .EXE

const { ipcRenderer } = require('electron');

const hookedWindows = new WeakSet();
const processedReqIds = new Set();

function sendToAllTargets(targetWin, payload) {
  try {
    if (targetWin && typeof targetWin.postMessage === 'function') {
      targetWin.postMessage(payload, '*');
    }
  } catch (e) {}
  try {
    window.postMessage(payload, '*');
  } catch (e) {}
  try {
    const frames = document.querySelectorAll('iframe');
    for (let i = 0; i < frames.length; i++) {
      if (frames[i].contentWindow) {
        frames[i].contentWindow.postMessage(payload, '*');
      }
    }
  } catch (e) {}
}

function handleAppMessage(event) {
  const data = event.data;
  if (!data || data.source !== 'GAS_WEBAPP_PAGE') return;

  const replyWin = event.source || event.currentTarget || window;

  if (data.type === 'PING_EXTENSION') {
    sendToAllTargets(replyWin, {
      source: 'GAS_BROWSER_EXTENSION',
      type: 'PONG_EXTENSION',
      version: '2.0.0-Desktop-EXE'
    });
  } else if (data.type === 'FETCH_LOCAL_URL' && data.reqId) {
    if (processedReqIds.has(data.reqId)) return;
    processedReqIds.add(data.reqId);

    ipcRenderer
      .invoke('desktop:fetch-local-url', data.url)
      .then((response) => {
        sendToAllTargets(replyWin, {
          source: 'GAS_BROWSER_EXTENSION',
          type: 'FETCH_LOCAL_RESULT',
          reqId: data.reqId,
          ok: Boolean(response && response.ok),
          html: response ? response.html : '',
          error: response ? response.error : ''
        });
      })
      .catch((err) => {
        sendToAllTargets(replyWin, {
          source: 'GAS_BROWSER_EXTENSION',
          type: 'FETCH_LOCAL_RESULT',
          reqId: data.reqId,
          ok: false,
          error: err && err.message ? err.message : String(err)
        });
      });
  } else if (data.type === 'CAPTURE_IGNITION_LINES' && data.reqId) {
    if (processedReqIds.has(data.reqId)) return;
    processedReqIds.add(data.reqId);

    ipcRenderer
      .invoke('desktop:capture-ignition-lines', {
        lines: data.lines || ['DJ11', 'DJ12', 'DJ14', 'DJ21', 'DJ22', 'DJ24'],
        ignitionUrl: data.ignitionUrl || 'http://10.72.9.21:8088/data/perspective/client/PTKCI/ce/insp-integ-monitoring'
      })
      .then((response) => {
        sendToAllTargets(replyWin, {
          source: 'GAS_BROWSER_EXTENSION',
          type: 'CAPTURE_IGNITION_RESULT',
          reqId: data.reqId,
          ok: Boolean(response && response.ok),
          items: response ? response.items : [],
          error: response ? response.error : ''
        });
      })
      .catch((err) => {
        sendToAllTargets(replyWin, {
          source: 'GAS_BROWSER_EXTENSION',
          type: 'CAPTURE_IGNITION_RESULT',
          reqId: data.reqId,
          ok: false,
          error: err && err.message ? err.message : String(err)
        });
      });
  }
}

function attachListenerToWindow(win) {
  if (!win || hookedWindows.has(win)) return;
  try {
    win.addEventListener('message', handleAppMessage);
    hookedWindows.add(win);
  } catch (e) {}
}

attachListenerToWindow(window);

window.addEventListener('DOMContentLoaded', () => {
  sendToAllTargets(window, {
    source: 'GAS_BROWSER_EXTENSION',
    type: 'PONG_EXTENSION',
    version: '2.0.0-Desktop-EXE'
  });
});
