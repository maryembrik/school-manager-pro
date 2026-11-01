// Electron entry point for the Windows desktop version of School Manager Pro.
// The renderer is the production Vite build (dist/), served over a privileged custom
// protocol (app://school/) so the origin is stable and IndexedDB data persists between runs.
const { app, BrowserWindow, protocol, shell, net } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const APP_NAME = 'School Manager Pro';
const SCHEME = 'app';
const HOST = 'school';
const DIST = path.join(__dirname, '..', 'dist');
const SMOKE = process.env.SMP_SMOKE === '1';

// All data (IndexedDB, settings) lives in %APPDATA%\School Manager Pro.
// SMP_USERDATA lets the self-test run against a throwaway profile.
app.setName(APP_NAME);
app.setPath('userData', process.env.SMP_USERDATA || path.join(app.getPath('appData'), APP_NAME));
app.setAppUserModelId('tn.school.manager.pro');

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data: blob:",
  "object-src 'self' blob:",
  "frame-src 'self' blob:",
  "connect-src 'self'",
].join('; ');

function registerProtocol() {
  protocol.handle(SCHEME, async (request) => {
    const url = new URL(request.url);
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.normalize(path.join(DIST, rel));
    // Never serve anything outside the build folder.
    if (!file.startsWith(DIST + path.sep)) return new Response('Forbidden', { status: 403 });
    const res = await net.fetch(pathToFileURL(file).toString());
    if (!file.endsWith('.html')) return res;
    const headers = new Headers(res.headers);
    headers.set('Content-Security-Policy', CSP);
    headers.set('Content-Type', 'text/html; charset=utf-8');
    return new Response(res.body, { status: res.status, headers });
  });
}

let mainWindow = null;

function secureContents(contents) {
  // Print views (about:blank) and attachments (blob:) open in app windows; web links go to the system browser.
  contents.setWindowOpenHandler(({ url }) => {
    if (url === 'about:blank' || url.startsWith('blob:')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 1000,
          height: 800,
          autoHideMenuBar: true,
          webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, plugins: true },
        },
      };
    }
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`${SCHEME}://${HOST}/`)) event.preventDefault();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 360,
    minHeight: 500,
    title: APP_NAME,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    autoHideMenuBar: true,
    show: !SMOKE,
    backgroundColor: '#f1f5f9',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      plugins: true, // built-in PDF viewer for attached documents
      spellcheck: false,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadURL(`${SCHEME}://${HOST}/index.html`);
  mainWindow.on('closed', () => (mainWindow = null));
  if (SMOKE) runSmokeCheck(mainWindow);
}

// Headless self-test used by `npm run desktop:check`: loads the production build and checks
// that storage, crypto and the UI are available, then exits with a status code.
function runSmokeCheck(win) {
  const fail = (msg) => {
    console.log(`SMOKE FAIL: ${msg}`);
    app.exit(1);
  };
  setTimeout(() => fail('timeout'), 30000);
  win.webContents.on('did-fail-load', (_e, code, desc) => fail(`load ${code} ${desc}`));
  win.webContents.on('console-message', (e) => {
    if (e.level === 'error') console.log(`renderer error: ${e.message}`);
  });
  win.webContents.on('did-finish-load', async () => {
    try {
      // SMP_SMOKE_PHASE=write stores a marker; a later run with =read must find it (persistence across restarts).
      const phase = process.env.SMP_SMOKE_PHASE || '';
      const result = await win.webContents.executeJavaScript(`(async () => {
        await new Promise((r) => setTimeout(r, 1500));
        const dbs = await indexedDB.databases();
        await document.fonts.ready;
        const idb = await new Promise((res, rej) => { const q = indexedDB.open('school-manager-pro'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
        const tx = (mode) => idb.transaction('meta', mode).objectStore('meta');
        let marker = null;
        if (${JSON.stringify(phase)} === 'write') {
          await new Promise((res, rej) => { const q = tx('readwrite').put({ key: 'smoke', value: 'persisted' }); q.onsuccess = res; q.onerror = () => rej(q.error); });
          marker = 'written';
        } else if (${JSON.stringify(phase)} === 'read') {
          marker = await new Promise((res, rej) => { const q = tx('readonly').get('smoke'); q.onsuccess = () => res(q.result ? q.result.value : null); q.onerror = () => rej(q.error); });
        }
        idb.close();
        return {
          phase: ${JSON.stringify(phase)},
          marker,
          origin: location.origin,
          secure: window.isSecureContext,
          subtle: !!(crypto && crypto.subtle),
          root: document.getElementById('root').innerText.slice(0, 80),
          databases: dbs.map((d) => d.name),
          cairo: document.fonts.check('16px Cairo', 'مدرسة'),
          dir: document.documentElement.dir,
        };
      })()`);
      console.log('SMOKE RESULT ' + JSON.stringify(result));
      console.log('USERDATA ' + app.getPath('userData'));
      const ok =
        result.secure &&
        result.subtle &&
        result.databases.includes('school-manager-pro') &&
        result.dir === 'rtl' &&
        result.root.length > 0 &&
        (phase !== 'read' || result.marker === 'persisted');
      app.exit(ok ? 0 : 1);
    } catch (e) {
      fail(String(e));
    }
  });
}

// One running instance at a time: the local database must not be opened by two processes.
if (!SMOKE && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.whenReady().then(() => {
    registerProtocol();
    createWindow();
  });
  app.on('web-contents-created', (_e, contents) => secureContents(contents));
  app.on('window-all-closed', () => app.quit());
}
