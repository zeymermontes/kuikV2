// Kuik Caja: the register PC's app.
//
// An Electron window showing app.kuik.mx/terminal, plus the one thing a
// browser on that PC cannot give the restaurant: the print agent
// (print-agent/, Go) running inside the app. The web POS finds the agent the
// same way it always has (http://127.0.0.1:9123, lib/pos/printing.ts), so
// receipts, kitchen tickets and the drawer keep working with the internet
// down, and nobody installs a second program or starts it after a reboot.
//
// Also: a customer screen on the second display (the POS's own window.open
// of /pos/customer lands there), kiosk mode, start with the computer.

'use strict';

const { app, BrowserWindow, Menu, ipcMain, screen, session, shell, dialog } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const VERSION = app.getVersion();
const SERVER = (process.env.KUIK_SERVER_URL || 'https://app.kuik.mx').replace(/\/$/, '');
const AGENT_PORT = 9123;
const SMOKE = process.argv.includes('--smoke');

const userData = () => app.getPath('userData');
const configPath = () => path.join(userData(), 'config.json');
const agentConfigPath = () => path.join(userData(), 'print-agent.json');
const agentLogPath = () => path.join(userData(), 'print-agent.log');

// ── Settings ─────────────────────────────────────────────────────────────────

function readJson(file, fallback) {
  try {
    return { ...fallback, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch {
    return { ...fallback };
  }
}

function loadConfig() {
  return readJson(configPath(), { kiosk: false, openAtLogin: false });
}

function saveConfig(patch) {
  const next = { ...loadConfig(), ...patch };
  fs.mkdirSync(userData(), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(next, null, 2));
  return next;
}

/** The agent keeps its token in its own file, which the app owns the path of. */
function agentToken() {
  return readJson(agentConfigPath(), {}).token || '';
}

// ── Print agent ──────────────────────────────────────────────────────────────

const agent = { proc: null, error: null, backoff: 2000, stopping: false };

function agentBinary() {
  const os = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'darwin' : 'linux';
  const arch = process.arch === 'arm64' ? 'arm64' : process.arch === 'arm' ? 'arm' : 'amd64';
  const name = `kuik-print-agent-${os}-${arch}${os === 'windows' ? '.exe' : ''}`;
  const dir = app.isPackaged ? path.join(process.resourcesPath, 'agent') : path.join(__dirname, 'agent');
  return path.join(dir, name);
}

function startAgent(token) {
  if (agent.proc || SMOKE) return;
  const bin = agentBinary();
  if (!fs.existsSync(bin)) {
    agent.error = `agent binary missing: ${bin} (run scripts/build-agent.sh)`;
    return;
  }
  const args = ['--config', agentConfigPath(), '--server', SERVER, '--port', String(AGENT_PORT)];
  if (token) args.push('--token', token);
  const log = fs.openSync(agentLogPath(), 'a');
  let proc;
  try {
    proc = spawn(bin, args, { stdio: ['ignore', log, log], windowsHide: true });
  } catch (err) {
    agent.error = String(err.message || err);
    return;
  }
  agent.proc = proc;
  agent.error = null;
  proc.on('exit', (code) => {
    agent.proc = null;
    fs.closeSync(log);
    if (agent.stopping) return;
    agent.error = `agent exited with code ${code}`;
    // Keep it alive: a crash (or a port fight with a stray copy) is retried
    // with a growing pause, like the agent's own poll loop.
    setTimeout(() => startAgent(''), agent.backoff);
    agent.backoff = Math.min(agent.backoff * 2, 30000);
  });
}

function stopAgent() {
  agent.stopping = true;
  if (agent.proc) {
    agent.proc.kill();
    agent.proc = null;
  }
}

// ── Windows ──────────────────────────────────────────────────────────────────

let main = null;
let setup = null;
let customer = null;

const webPreferences = {
  preload: path.join(__dirname, 'preload.js'),
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
};

function createMain() {
  const cfg = loadConfig();
  main = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#111114',
    kiosk: cfg.kiosk,
    autoHideMenuBar: true,
    title: 'Kuik Caja',
    webPreferences,
  });
  main.on('closed', () => {
    main = null;
  });

  // window.open from the POS: the customer screen goes to the second display,
  // full screen and without a frame; anything else (KDS, settings) is a plain
  // window on this one, in the same session.
  main.webContents.setWindowOpenHandler(({ url }) => {
    let u;
    try {
      u = new URL(url);
    } catch {
      return { action: 'deny' };
    }
    if (u.origin !== new URL(SERVER).origin) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    if (u.pathname.startsWith('/pos/customer')) {
      openCustomerScreen(url);
      return { action: 'deny' };
    }
    return { action: 'allow', overrideBrowserWindowOptions: { backgroundColor: '#111114', autoHideMenuBar: true, webPreferences } };
  });

  main.loadURL(`${SERVER}/terminal`);
}

function secondDisplay() {
  const primary = screen.getPrimaryDisplay();
  return screen.getAllDisplays().find((d) => d.id !== primary.id) || null;
}

function openCustomerScreen(url) {
  if (customer && !customer.isDestroyed()) {
    customer.loadURL(url);
    customer.focus();
    return true;
  }
  const display = secondDisplay();
  customer = new BrowserWindow({
    ...(display
      ? { x: display.bounds.x, y: display.bounds.y, width: display.bounds.width, height: display.bounds.height, fullscreen: true, frame: false }
      : { width: 800, height: 600 }),
    backgroundColor: '#111114',
    autoHideMenuBar: true,
    title: 'Kuik — Pantalla del cliente',
    webPreferences,
  });
  customer.on('closed', () => {
    customer = null;
  });
  customer.loadURL(url);
  return !!display;
}

function openSetup() {
  if (setup && !setup.isDestroyed()) return setup.focus();
  setup = new BrowserWindow({
    width: 520,
    height: 560,
    resizable: false,
    backgroundColor: '#111114',
    autoHideMenuBar: true,
    title: 'Kuik Caja — Impresión',
    parent: main || undefined,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true },
  });
  setup.on('closed', () => {
    setup = null;
  });
  setup.loadFile('setup.html');
}

// ── Menu ─────────────────────────────────────────────────────────────────────

function buildMenu() {
  const cfg = loadConfig();
  const template = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    {
      label: 'Kuik',
      submenu: [
        {
          label: 'Modo kiosco',
          type: 'checkbox',
          checked: cfg.kiosk,
          accelerator: 'CmdOrCtrl+Shift+K',
          click: (item) => setKiosk(item.checked),
        },
        {
          label: 'Abrir con la computadora',
          type: 'checkbox',
          checked: cfg.openAtLogin,
          click: (item) => {
            app.setLoginItemSettings({ openAtLogin: item.checked });
            saveConfig({ openAtLogin: item.checked });
          },
        },
        { type: 'separator' },
        { label: 'Impresión: token del agente…', click: openSetup },
        { label: 'Ver registro del agente', click: () => shell.showItemInFolder(agentLogPath()) },
        { label: 'Pantalla del cliente', click: () => openCustomerScreen(`${SERVER}/pos/customer`) },
        { type: 'separator' },
        { label: 'Cambiar modo', click: () => main && main.loadURL(`${SERVER}/terminal?pick=1`) },
        { role: 'reload' },
        { role: 'quit', label: 'Salir' },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function setKiosk(on) {
  saveConfig({ kiosk: on });
  if (main) main.setKiosk(on);
  buildMenu();
}

// ── IPC (preload bridge) ─────────────────────────────────────────────────────

ipcMain.handle('agent:status', () => ({
  running: !!agent.proc,
  error: agent.error,
  port: AGENT_PORT,
  hasToken: !!agentToken(),
}));
ipcMain.handle('customer:open', (_e, url) => openCustomerScreen(typeof url === 'string' && url.startsWith(SERVER) ? url : `${SERVER}/pos/customer`));
ipcMain.handle('kiosk:set', (_e, on) => setKiosk(!!on));
ipcMain.handle('setup:save', (_e, token) => {
  const t = String(token || '').trim();
  if (!t.startsWith('kpa_')) return { ok: false, error: 'El token empieza con kpa_' };
  stopAgent();
  agent.stopping = false;
  agent.backoff = 2000;
  startAgent(t);
  if (!main) createMain();
  if (setup) setup.close();
  return { ok: true };
});
ipcMain.handle('setup:skip', () => {
  if (!main) createMain();
  if (setup) setup.close();
  return { ok: true };
});

// ── Lifecycle ────────────────────────────────────────────────────────────────

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (main) {
      if (main.isMinimized()) main.restore();
      main.focus();
    }
  });

  // The web app reads this token to know it is inside the desktop shell
  // (lib/native/shell.ts), before any window exists so every window gets it.
  app.userAgentFallback = `${app.userAgentFallback} KuikDesktop/${VERSION}`;

  app.whenReady().then(() => {
    const origin = new URL(SERVER).origin;
    // The POS reaches the agent on loopback from an https page: Chromium's
    // Local Network Access asks permission for that. Grant it to our site.
    const ours = (wc) => {
      try {
        return wc && new URL(wc.getURL()).origin === origin;
      } catch {
        return false;
      }
    };
    session.defaultSession.setPermissionRequestHandler((wc, _permission, callback) => callback(ours(wc)));
    session.defaultSession.setPermissionCheckHandler((wc) => ours(wc));

    buildMenu();

    if (SMOKE) {
      const w = new BrowserWindow({ show: false, webPreferences });
      w.loadURL('about:blank').then(() => {
        console.log(`smoke ok: KuikDesktop/${VERSION} → ${SERVER}/terminal, agent ${agentBinary()}`);
        app.quit();
      });
      return;
    }

    const token = agentToken();
    if (token) {
      startAgent('');
      createMain();
    } else {
      openSetup();
    }
  });

  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', stopAgent);
}
