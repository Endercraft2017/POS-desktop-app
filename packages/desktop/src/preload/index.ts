import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  db: {
    query: (sql: string, params?: any[]) =>
      ipcRenderer.invoke("db:query", sql, params),
    exec: (sql: string) => ipcRenderer.invoke("db:exec", sql),
  },
});
