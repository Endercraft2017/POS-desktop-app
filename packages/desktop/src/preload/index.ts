import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  db: {
    query: (sql: string, params?: any[]) =>
      ipcRenderer.invoke("db:query", sql, params),
    exec: (sql: string) => ipcRenderer.invoke("db:exec", sql),
    batch: (statements: { sql: string; params?: any[] }[]) =>
      ipcRenderer.invoke("db:batch", statements),
  },
  window: {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    maximize: () => ipcRenderer.invoke("window:maximize"),
    close: () => ipcRenderer.invoke("window:close"),
  },
});
