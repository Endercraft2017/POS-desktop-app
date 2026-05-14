import { app, BrowserWindow, ipcMain } from "electron";
import path from "path";
import { initializeDatabase, getDatabase } from "./database";

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    title: "POS System",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false, // Allow file:// to load ES modules
    },
  });

  mainWindow.webContents.openDevTools();

  mainWindow.webContents.on("console-message", (_e, _level, message) => {
    console.log("[RENDERER]", message);
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  await initializeDatabase();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Window control IPC handlers
ipcMain.handle("window:minimize", () => mainWindow?.minimize());
ipcMain.handle("window:maximize", () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});
ipcMain.handle("window:close", () => mainWindow?.close());

// IPC handlers for database operations
ipcMain.handle("db:query", async (_event, sql: string, params?: any[]) => {
  const db = getDatabase();
  try {
    const stmt = db.prepare(sql);
    if (sql.trim().toUpperCase().startsWith("SELECT")) {
      return { success: true, data: stmt.all(...(params || [])) };
    } else {
      const result = stmt.run(...(params || []));
      return { success: true, data: result };
    }
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("db:exec", async (_event, sql: string) => {
  const db = getDatabase();
  try {
    db.exec(sql);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// Runs an array of statements in a single transaction. One IPC round-trip,
// one fsync, atomic on failure. Used by hot-path writes like checkout.
ipcMain.handle(
  "db:batch",
  async (_event, statements: { sql: string; params?: any[] }[]) => {
    const db = getDatabase();
    try {
      const tx = db.transaction((list: { sql: string; params?: any[] }[]) => {
        for (const s of list) {
          db.prepare(s.sql).run(...(s.params || []));
        }
      });
      tx(statements);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
);
