const { app, BrowserWindow, ipcMain, Menu, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let autoUpdater = null;
try {
  autoUpdater = require('electron-updater').autoUpdater;
} catch (e) {}

// User-Agent Chrome Windows 10/11 standar agar di server Ignition tercatat 100% identik dengan Google Chrome biasa
const CHROME_WIN_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const DEFAULT_CONFIG_PATH = path.join(__dirname, 'config.json');
const USER_SETTINGS_PATH = path.join(app.getPath('userData'), 'desktop-settings.json');

function loadSettings() {
  let defaults = {
    pwaUrl: 'https://inspection-workspace-pwa.vercel.app',
    ignitionUrl: 'http://10.72.9.21:8088/data/perspective/client/PTKCI/ce/insp-integ-monitoring'
  };
  try {
    if (fs.existsSync(DEFAULT_CONFIG_PATH)) {
      defaults = Object.assign(defaults, JSON.parse(fs.readFileSync(DEFAULT_CONFIG_PATH, 'utf8')));
    }
  } catch (e) {}
  try {
    if (fs.existsSync(USER_SETTINGS_PATH)) {
      defaults = Object.assign(defaults, JSON.parse(fs.readFileSync(USER_SETTINGS_PATH, 'utf8')));
    }
  } catch (e) {}
  return defaults;
}

function saveSettings(newSettings) {
  const current = Object.assign(loadSettings(), newSettings);
  try {
    fs.writeFileSync(USER_SETTINGS_PATH, JSON.stringify(current, null, 2), 'utf8');
  } catch (e) {}
  return current;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let mainWindow = null;
let ignitionWindow = null;

// Script injeksi yang dijalankan di dalam jendela Ignition untuk berpindah DJ11..DJ24 secara akurat
const SWITCH_IGNITION_LINE_SOURCE = `
(async function switchIgnitionLineAccurate(targetLine) {
  const ALL_LINES = ['DJ11', 'DJ12', 'DJ14', 'DJ21', 'DJ22', 'DJ24'];
  const targetUp = String(targetLine || '').toUpperCase();

  function findAllLineElements() {
    const results = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    let textNode;
    while ((textNode = walker.nextNode())) {
      const val = (textNode.nodeValue || '').trim().toUpperCase();
      if (!ALL_LINES.includes(val)) continue;
      const el = textNode.parentElement;
      if (!el || !el.getBoundingClientRect) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 5 && r.height > 5 && r.top >= 25 && r.top <= 260 && r.left >= 15) {
        results.push({
          code: val,
          el: el,
          rect: r,
          cx: r.left + r.width / 2,
          cy: r.top + r.height / 2
        });
      }
    }
    return results;
  }

  function fireReactClickOnNodes(nodesList, cx, cy) {
    const evOpts = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX: cx,
      clientY: cy,
      screenX: cx,
      screenY: cy,
      button: 0,
      buttons: 1
    };

    for (let i = 0; i < nodesList.length; i++) {
      const node = nodesList[i];
      if (!node) continue;
      try { node.dispatchEvent(new PointerEvent('pointerdown', evOpts)); } catch (e) {}
      try { node.dispatchEvent(new MouseEvent('mousedown', evOpts)); } catch (e) {}
      try { node.dispatchEvent(new PointerEvent('pointerup', evOpts)); } catch (e) {}
      try { node.dispatchEvent(new MouseEvent('mouseup', evOpts)); } catch (e) {}
      try {
        if (typeof node.click === 'function') node.click();
        else node.dispatchEvent(new MouseEvent('click', evOpts));
      } catch (e) {}

      try {
        const keys = Object.keys(node);
        for (let k = 0; k < keys.length; k++) {
          const key = keys[k];
          if (key.startsWith('__reactProps$') || key.startsWith('__reactEventHandlers$')) {
            const props = node[key];
            if (!props) continue;
            const synEv = {
              target: node,
              currentTarget: node,
              nativeEvent: new MouseEvent('click', evOpts),
              clientX: cx,
              clientY: cy,
              button: 0,
              buttons: 1,
              isTrusted: true,
              preventDefault: function() {},
              stopPropagation: function() {},
              persist: function() {}
            };
            if (typeof props.onPointerDown === 'function') { try { props.onPointerDown(synEv); } catch (e) {} }
            if (typeof props.onMouseDown === 'function') { try { props.onMouseDown(synEv); } catch (e) {} }
            if (typeof props.onPointerUp === 'function') { try { props.onPointerUp(synEv); } catch (e) {} }
            if (typeof props.onMouseUp === 'function') { try { props.onMouseUp(synEv); } catch (e) {} }
            if (typeof props.onClick === 'function') { try { props.onClick(synEv); } catch (e) {} }
          }
        }
      } catch (e) {}
    }
  }

  function clickTabButtonElement(tabItem) {
    if (!tabItem || !tabItem.el) return;
    const cx = tabItem.cx;
    const cy = tabItem.cy;
    const hitEl = document.elementFromPoint(cx, cy) || tabItem.el;

    const btnChain = [];
    function collectButtonChain(startNode) {
      let curr = startNode;
      for (let d = 0; d < 5 && curr && curr !== document.body; d++) {
        const txt = (curr.textContent || '').trim().toUpperCase();
        if (txt && txt !== tabItem.code) break;
        if (!btnChain.includes(curr)) btnChain.push(curr);
        curr = curr.parentElement;
      }
    }
    collectButtonChain(hitEl);
    collectButtonChain(tabItem.el);
    fireReactClickOnNodes(btnChain, cx, cy);
  }

  function openCollapsedLineDrawer(bigTitleItem) {
    if (!bigTitleItem || !bigTitleItem.el) return;
    const btRect = bigTitleItem.rect;
    const cx = bigTitleItem.cx;
    const cy = btRect.bottom + 10;

    const candidateNodes = [];
    function addNodeAndSmallParents(startEl) {
      let curr = startEl;
      for (let d = 0; d < 5 && curr && curr !== document.body; d++) {
        const r = curr.getBoundingClientRect ? curr.getBoundingClientRect() : null;
        if (r && (r.width > 150 || r.height > 115)) break;
        if (!candidateNodes.includes(curr)) candidateNodes.push(curr);
        curr = curr.parentElement;
      }
    }

    const allSvgs = Array.from(document.querySelectorAll('svg, path'));
    for (let i = 0; i < allSvgs.length; i++) {
      const sr = allSvgs[i].getBoundingClientRect();
      if (
        sr.width >= 4 && sr.width <= 60 &&
        sr.top >= btRect.bottom - 8 && sr.top <= btRect.bottom + 40 &&
        Math.abs((sr.left + sr.width / 2) - cx) <= 50
      ) {
        addNodeAndSmallParents(allSvgs[i]);
      }
    }

    const offsetsY = [6, 11, 16, 22];
    for (let i = 0; i < offsetsY.length; i++) {
      const hit = document.elementFromPoint(cx, btRect.bottom + offsetsY[i]);
      if (hit) addNodeAndSmallParents(hit);
    }

    let titleCurr = bigTitleItem.el;
    for (let d = 0; d < 4 && titleCurr && titleCurr !== document.body; d++) {
      if (titleCurr.nextElementSibling) addNodeAndSmallParents(titleCurr.nextElementSibling);
      titleCurr = titleCurr.parentElement;
    }

    fireReactClickOnNodes(candidateNodes, cx, cy);
  }

  function analyzeHeaderState() {
    const all = findAllLineElements();
    if (all.length === 0) return { bigTitle: null, tabButtons: [], isDrawerOpen: false };
    all.sort((a, b) => a.rect.top - b.rect.top);
    const topMostY = all[0].rect.top;
    const topRow = all.filter((item) => Math.abs(item.rect.top - topMostY) <= 16);
    topRow.sort((a, b) => a.rect.left - b.rect.left);
    const bigTitle = topRow[0];
    const tabButtons = all.filter((item) => item.rect.top > topMostY + 18);
    return {
      bigTitle: bigTitle,
      tabButtons: tabButtons,
      isDrawerOpen: tabButtons.length >= 3
    };
  }

  async function ensureDrawerIsOpen() {
    let st = analyzeHeaderState();
    for (let attempt = 0; attempt < 2 && !st.isDrawerOpen && st.bigTitle; attempt++) {
      openCollapsedLineDrawer(st.bigTitle);
      await new Promise((r) => setTimeout(r, 550));
      st = analyzeHeaderState();
    }
    return st;
  }

  function hasIgnitionLoaderVisible() {
    const bodyText = (document.body && document.body.innerText) ? document.body.innerText.toUpperCase() : '';
    if (/\\bLOADING\\b/.test(bodyText)) return true;
    const loadingSelectors = [
      '.ia_loadingIndicator',
      '.ia_progressSpinner',
      '.psc-loading',
      '[class*="loading-spinner"]',
      '[class*="LoadingIndicator"]',
      '.view-loader'
    ];
    for (let i = 0; i < loadingSelectors.length; i++) {
      const nodes = document.querySelectorAll(loadingSelectors[i]);
      for (let j = 0; j < nodes.length; j++) {
        const r = nodes[j].getBoundingClientRect();
        const st = window.getComputedStyle(nodes[j]);
        if (r.width > 4 && r.height > 4 && st.display !== 'none' && st.visibility !== 'hidden' && Number(st.opacity) > 0.05) {
          return true;
        }
      }
    }
    return false;
  }

  async function waitUniformlyForIgnition(guaranteedMs, extraLoaderMaxMs) {
    await new Promise((r) => setTimeout(r, guaranteedMs));
    const extraStart = Date.now();
    while (Date.now() - extraStart < extraLoaderMaxMs) {
      if (!hasIgnitionLoaderVisible()) break;
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  let state = await ensureDrawerIsOpen();

  if (!state.bigTitle || state.bigTitle.code !== targetUp) {
    for (let tryIdx = 0; tryIdx < 3; tryIdx++) {
      state = analyzeHeaderState();
      if (state.bigTitle && state.bigTitle.code === targetUp) break;

      state = await ensureDrawerIsOpen();
      const targetTab = state.tabButtons.find((tb) => tb.code === targetUp);
      if (targetTab) clickTabButtonElement(targetTab);

      const t0 = Date.now();
      let switched = false;
      while (Date.now() - t0 < 4500) {
        await new Promise((r) => setTimeout(r, 200));
        const checkState = analyzeHeaderState();
        if (checkState.bigTitle && checkState.bigTitle.code === targetUp) {
          switched = true;
          break;
        }
      }
      if (switched) break;
    }

    await waitUniformlyForIgnition(8000, 5000);
    await ensureDrawerIsOpen();
    await new Promise((r) => setTimeout(r, 1000));
  } else {
    await waitUniformlyForIgnition(4000, 3000);
  }

  const finalState = analyzeHeaderState();
  let cropX = 42;
  let cropY = 48;
  const titleNode = finalState.bigTitle ? finalState.bigTitle.el : null;
  if (titleNode) {
    let curr = titleNode;
    while (curr && curr.parentElement && curr !== document.body) {
      const r = curr.getBoundingClientRect();
      if (r.width > window.innerWidth * 0.55 && r.height >= 45 && r.height <= 240 && r.top >= 30 && r.top <= 75) {
        cropX = Math.max(0, Math.floor(r.left));
        cropY = Math.max(0, Math.floor(r.top));
        break;
      }
      curr = curr.parentElement;
    }
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return {
    activeLineNow: finalState.bigTitle ? finalState.bigTitle.code : null,
    isDrawerOpen: finalState.isDrawerOpen,
    cropX: cropX,
    cropY: cropY,
    cropW: Math.max(100, vw - cropX),
    cropH: Math.max(100, vh - cropY),
    viewportW: vw,
    viewportH: vh
  };
})
`;

async function getOrCreateIgnitionWindow(targetUrl, showImmediately) {
  const settings = loadSettings();
  const urlToLoad = targetUrl || settings.ignitionUrl;

  if (ignitionWindow && !ignitionWindow.isDestroyed()) {
    if (showImmediately) {
      ignitionWindow.show();
      ignitionWindow.focus();
    }
    const currentUrl = ignitionWindow.webContents.getURL();
    if (!currentUrl || currentUrl === 'about:blank') {
      await ignitionWindow.loadURL(urlToLoad, { userAgent: CHROME_WIN_UA });
    }
    return ignitionWindow;
  }

  ignitionWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    useContentSize: true,
    show: Boolean(showImmediately),
    title: 'Panel Ignition Monitoring Integrity — Inspection Workspace',
    backgroundColor: '#092b3a',
    autoHideMenuBar: true,
    webPreferences: {
      partition: 'persist:ignition-ptkci',
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  ignitionWindow.webContents.setUserAgent(CHROME_WIN_UA);

  ignitionWindow.on('close', (e) => {
    // Jangan hancurkan sesi jika hanya ditutup user, cukup sembunyikan
    if (!app.isQuitting) {
      e.preventDefault();
      ignitionWindow.hide();
    }
  });

  await ignitionWindow.loadURL(urlToLoad, { userAgent: CHROME_WIN_UA });
  return ignitionWindow;
}

// Mengecek apakah halaman Ignition sudah masuk ke halaman Monitoring Integrity (DJ11..DJ24 terlihat)
async function checkIgnitionMonitoringReady(win) {
  try {
    return await win.webContents.executeJavaScript(`
      (function() {
        const text = (document.body && document.body.innerText) ? document.body.innerText.toUpperCase() : '';
        const hasDjLine = /\\b(DJ11|DJ12|DJ14|DJ21|DJ22|DJ24)\\b/.test(text);
        const hasPasswordInput = Boolean(document.querySelector('input[type="password"]'));
        return { ready: hasDjLine && !hasPasswordInput, hasDjLine: hasDjLine, hasPasswordInput: hasPasswordInput };
      })()
    `);
  } catch (e) {
    return { ready: false };
  }
}

// Dialog kecil untuk mengatur URL Vercel PWA kapan saja tanpa perlu build ulang .EXE
function openUrlConfigPrompt() {
  const settings = loadSettings();
  const promptWin = new BrowserWindow({
    width: 520,
    height: 250,
    parent: mainWindow,
    modal: true,
    resizable: false,
    autoHideMenuBar: true,
    title: 'Atur URL Vercel PWA — Inspection Workspace',
    backgroundColor: '#092b3a',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  const html = `
    <!doctype html>
    <html>
    <head><meta charset="utf-8"><style>
      body{margin:0;padding:22px;background:#092b3a;color:#e9f6f2;font:13.5px/1.45 Segoe UI,Arial,sans-serif}
      label{display:block;font-size:11px;font-weight:800;letter-spacing:.08em;color:#8ce0c2;margin-bottom:6px;text-transform:uppercase}
      input{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:9px;border:1px solid #2b657a;background:#061e29;color:#fff;font-size:13.5px;outline:none}
      input:focus{border-color:#239879}
      .actions{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}
      button{padding:9px 16px;border-radius:8px;border:0;font-weight:700;cursor:pointer}
      .save{background:linear-gradient(120deg,#137c9b,#239879);color:#fff}
      .cancel{background:#163d4e;color:#c9dfe0}
    </style></head>
    <body>
      <label>URL Vercel PWA Anda</label>
      <input id="urlInput" type="url" value="${settings.pwaUrl.replace(/"/g, '&quot;')}" placeholder="https://nama-project-anda.vercel.app">
      <p style="font-size:11.5px;color:#a9c6ca;margin:8px 0 0">Setiap update di GitHub/Vercel pada URL ini akan otomatis tampil di dalam aplikasi .EXE.</p>
      <div class="actions">
        <button class="cancel" onclick="window.close()">Batal</button>
        <button class="save" onclick="save()">Simpan & Muat</button>
      </div>
      <script>
        const { ipcRenderer } = require('electron');
        function save() {
          const val = document.getElementById('urlInput').value.trim();
          if (val) ipcRenderer.send('desktop:save-pwa-url', val);
          window.close();
        }
      </script>
    </body></html>
  `;
  promptWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
}

function buildAppMenu() {
  const template = [
    {
      label: 'Aplikasi',
      submenu: [
        {
          label: 'Muat Ulang (Refresh Update Terbaru)',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            if (mainWindow) mainWindow.webContents.reloadIgnoringCache();
          }
        },
        {
          label: 'Atur URL Vercel PWA...',
          click: () => openUrlConfigPrompt()
        },
        { type: 'separator' },
        {
          label: 'Cek Update Aplikasi (.EXE)',
          click: async () => {
            if (!autoUpdater) {
              dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: 'Update Otomatis',
                message: 'Tampilan & fitur utama sudah otomatis mengikuti update terbaru dari Vercel Anda.'
              });
              return;
            }
            try {
              await autoUpdater.checkForUpdatesAndNotify();
              dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: 'Cek Update .EXE',
                message: 'Pengecekan update selesai. Jika ada versi .EXE baru di GitHub Releases, aplikasi akan mengunduhnya secara otomatis.'
              });
            } catch (err) {
              dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: 'Info Update',
                message: 'Tampilan web otomatis terupdate dari Vercel. (' + (err.message || err) + ')'
              });
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Keluar',
          role: 'quit'
        }
      ]
    },
    {
      label: 'Panel Ignition (10.72.9.21)',
      submenu: [
        {
          label: 'Buka & Login Ignition Manual',
          click: async () => {
            await getOrCreateIgnitionWindow(null, true);
          }
        },
        {
          label: 'Sembunyikan Jendela Ignition',
          click: () => {
            if (ignitionWindow && !ignitionWindow.isDestroyed()) {
              ignitionWindow.hide();
            }
          }
        }
      ]
    },
    {
      label: 'Tampilan',
      submenu: [
        { label: 'Layar Penuh (Full Screen)', role: 'togglefullscreen' },
        { label: 'Perbesar (Zoom In)', role: 'zoomIn' },
        { label: 'Perkecil (Zoom Out)', role: 'zoomOut' },
        { label: 'Reset Zoom', role: 'resetZoom' },
        { type: 'separator' },
        { label: 'Developer Tools', role: 'toggleDevTools' }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createMainWindow() {
  const settings = loadSettings();

  mainWindow = new BrowserWindow({
    width: 1380,
    height: 860,
    minWidth: 360,
    minHeight: 540,
    title: 'Inspection Workspace — PT KCI',
    backgroundColor: '#092b3a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: false,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: true
    }
  });

  mainWindow.webContents.setUserAgent(CHROME_WIN_UA);
  buildAppMenu();

  mainWindow.loadURL(settings.pwaUrl).catch(() => {
    openUrlConfigPrompt();
  });

  if (autoUpdater) {
    try {
      autoUpdater.checkForUpdatesAndNotify();
    } catch (e) {}
  }
}

// =============================================================================
// IPC HANDLER 1: Simpan URL Vercel Baru
// =============================================================================
ipcMain.on('desktop:save-pwa-url', (_event, newUrl) => {
  const cleaned = String(newUrl || '').trim();
  if (!cleaned) return;
  saveSettings({ pwaUrl: cleaned });
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.loadURL(cleaned);
  }
});

// =============================================================================
// IPC HANDLER 2: Auto Sampling 23 Mesin & CID Test HTML via LAN Pabrik
// =============================================================================
ipcMain.handle('desktop:fetch-local-url', async (_event, rawUrl) => {
  try {
    const targetUrl = String(rawUrl || '').split('#')[0];
    if (!targetUrl) throw new Error('URL kosong.');

    // Whitelist keamanan jaringan lokal pabrik (10.72.x.x / localhost)
    const parsed = new URL(targetUrl);
    if (!parsed.hostname.startsWith('10.72.') && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
      throw new Error('Demi keamanan, hanya IP intranet pabrik (10.72.x.x) yang diizinkan.');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(targetUrl, {
      cache: 'no-store',
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!res.ok) {
      throw new Error('HTTP ' + res.status + ' ' + res.statusText);
    }
    const html = await res.text();
    return { ok: true, url: rawUrl, html: html };
  } catch (err) {
    return { ok: false, url: rawUrl, error: err && err.message ? err.message : String(err) };
  }
});

// =============================================================================
// IPC HANDLER 3: Otomatis Buka & Screenshot 6 Line Ignition (DJ11..DJ24)
// =============================================================================
ipcMain.handle('desktop:capture-ignition-lines', async (_event, payload) => {
  const lines = (payload && payload.lines) || ['DJ11', 'DJ12', 'DJ14', 'DJ21', 'DJ22', 'DJ24'];
  const ignitionUrl =
    (payload && payload.ignitionUrl) ||
    loadSettings().ignitionUrl ||
    'http://10.72.9.21:8088/data/perspective/client/PTKCI/ce/insp-integ-monitoring';

  try {
    // 1. Buka / aktifkan jendela internal Ignition (tanpa butuh browser Chrome/Edge luar!)
    const ignWin = await getOrCreateIgnitionWindow(ignitionUrl, true);
    ignWin.setContentSize(1366, 768);
    ignWin.show();
    await sleep(1500);

    // 2. Cek apakah sudah berada di halaman Monitoring Integrity atau masih meminta Login akun Ignition
    let readyCheck = await checkIgnitionMonitoringReady(ignWin);
    if (!readyCheck.ready) {
      ignWin.setTitle('SILAKAN LOGIN AKUN IGNITION ANDA TERLEBIH DAHULU — Inspection Workspace');
      ignWin.show();
      ignWin.focus();

      // Tunggu hingga 3 menit sampai user selesai login akun Ignition resminya dan DJ11..DJ24 muncul
      const waitLoginStart = Date.now();
      while (Date.now() - waitLoginStart < 180000) {
        await sleep(1000);
        readyCheck = await checkIgnitionMonitoringReady(ignWin);
        if (readyCheck.ready) {
          // Beri waktu 3 detik setelah baru selesai login agar halaman render penuh
          await sleep(3000);
          break;
        }
      }

      if (!readyCheck.ready) {
        throw new Error(
          'Halaman Monitoring Integrity (DJ11–DJ24) belum terbuka. Silakan login akun Ignition Anda di Panel Ignition lalu coba lagi.'
        );
      }
    }

    ignWin.setTitle('Mengambil Screenshot Monitoring Integrity (DJ11–DJ24)... — Inspection Workspace');

    const results = [];
    for (let i = 0; i < lines.length; i++) {
      const lineCode = lines[i];
      let cropMeta = {
        cropX: 42,
        cropY: 48,
        cropW: 1300,
        cropH: 700,
        viewportW: 1366,
        viewportH: 768
      };

      try {
        const resMeta = await ignWin.webContents.executeJavaScript(
          `${SWITCH_IGNITION_LINE_SOURCE}(${JSON.stringify(lineCode)})`
        );
        if (resMeta && resMeta.cropW) {
          cropMeta = resMeta;
        }
      } catch (scriptErr) {
        await sleep(1000);
      }

      await sleep(500);
      const nativeImg = await ignWin.webContents.capturePage();
      const jpegBuffer = nativeImg.toJPEG(92);
      const rawDataUrl = 'data:image/jpeg;base64,' + jpegBuffer.toString('base64');

      results.push({
        lineCode: lineCode,
        rawDataUrl: rawDataUrl,
        cropMeta: cropMeta
      });
    }

    // Sembunyikan kembali jendela Ignition setelah selesai memotret ke-6 Line
    ignWin.setTitle('Panel Ignition Monitoring Integrity — Inspection Workspace');
    ignWin.hide();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.focus();
    }

    return { ok: true, items: results };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
});

app.whenReady().then(createMainWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
