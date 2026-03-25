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
    },
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

// IPC handlers for database operations
// The renderer sends requests through the preload bridge,
// and the main process executes them against the local SQLite DB.

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
