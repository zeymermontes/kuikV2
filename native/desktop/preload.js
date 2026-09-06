// What the page may ask the desktop shell for. Exposed as window.kuikDesktop
// and read through lib/native/shell.ts (DesktopBridge). Kept to a handful of
// calls that name their intent; no raw ipc or Node reaches the page.
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kuikDesktop', {
  version: process.env.npm_package_version || 'dev',
  agentStatus: () => ipcRenderer.invoke('agent:status'),
  openCustomerScreen: (url) => ipcRenderer.invoke('customer:open', url),
  setKiosk: (on) => ipcRenderer.invoke('kiosk:set', on),
  // Setup window only.
  saveAgentToken: (token) => ipcRenderer.invoke('setup:save', token),
  skipAgent: () => ipcRenderer.invoke('setup:skip'),
});
